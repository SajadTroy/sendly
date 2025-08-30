const express = require('express');
const multer = require("multer");
const path = require("path");
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
    res.render('index', { title: 'Sendly - File Sharing Made Easy' });
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
        res.render('final_upload', { title: `Your file "${req.file.filename}" uploaded succesfull`, fileUrl: fileUrl });
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

        if (fileData.createdAt < Date.now() - 24*60*60*1000) {
            return res.status(410).send('File has expired');
        }

        res.download(path.resolve(fileData.filePath));
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

module.exports = router;