const express = require('express');
const multer = require("multer");
const path = require("path");
const cron = require("node-cron");
const { File } = require('../models');
const router = express.Router();

// Storage configuration for multer
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, "uploads/");  // directory to save files
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname)); // unique filename
    },
});

// Initialize multer
const upload = multer({ storage: storage });

// Home route
router.get('/', (req, res) => {
    res.render('home', { title: 'Sendly - File Sharing Made Easy', description: 'Upload and share files easily with Sendly. Files are available for 24 hours.' });
});

router.post('/upload', upload.single("file"), async (req, res) => {
    try {
        if (!req.file) {
            return res.send("No file uploaded.");
        }
        console.log(req.file);

        const fileData = new File({
            filePath: req.file.path,
            shortCode: Math.random().toString(36).substring(2, 8)
        });

        await fileData.save();
        console.log("File saved to database", fileData);

        let fileUrl = `${req.protocol}://${req.get('host')}/files/${fileData.shortCode}`;
        // res.render('final_upload', { title: `Your file "${req.file.filename}" uploaded succesfull`, description: 'Share your file using the link below. Note: The file will be available for 24 hours.', fileUrl });

        res.json({ file_url: fileUrl });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

router.get('/files/:shortCode', async (req, res) => {
    try {
        const { shortCode } = req.params;

        const fileData = await File.findOne({ shortCode });
        if (!fileData) {
            return res.status(404).send('File not found');
        }

        if (fileData.createdAt < Date.now() - 24 * 60 * 60 * 1000) {
            return res.status(410).send('File has expired');
        }

        const absolutePath = path.join(__dirname, '..', fileData.filePath);

        res.setHeader("Content-Disposition", `attachment; filename="${path.basename(absolutePath)}"`);
        res.setHeader("Content-Type", "application/octet-stream");
        res.setHeader("Accept-Ranges", "none");

        res.sendFile(absolutePath, (err) => {
            if (err) {
                console.error("SendFile error:", err);
                res.status(500).send("Error sending file");
            }
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

cron.schedule("0 1 * * *", async () => {
    try {
        const files = await File.find();
        for (let file of files) {
            if (file.createdAt < Date.now() - 24*60*60*1000) {
                await File.deleteOne({ _id: file._id });
                fs.unlinkSync(path.resolve(file.filePath));
                console.log(`Deleted file: ${file.filePath}`);
            }
        }
    } catch (err) {
        console.error("Error during cleanup:", err);
    }
});

module.exports = router;