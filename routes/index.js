const express = require('express');
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const cron = require("node-cron");
const { File } = require('../models');
const router = express.Router();

// Multer for chunk uploads
const upload = multer({ dest: "uploads/chunks/" });

// ---------- HOME PAGE ----------
router.get('/', (req, res) => {
    res.render('home', { title: 'Sendly - File Sharing Made Easy', description: 'Upload and share files easily with Sendly. Files are available for 24 hours.' });
});

// ---------- CHUNK UPLOAD ----------
router.post("/upload-chunk", upload.single("chunk"), (req, res) => {
    try {
        const { fileName, chunkIndex } = req.body;
        const chunkDir = path.join("uploads/chunks", fileName);

        if (!fs.existsSync(chunkDir)) {
            fs.mkdirSync(chunkDir, { recursive: true });
        }

        const chunkPath = path.join(chunkDir, `${chunkIndex}`);
        fs.renameSync(req.file.path, chunkPath);

        res.json({ status: "ok", chunkIndex });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to upload chunks" });
    }
});

// ---------- MERGE CHUNKS ----------
router.post("/merge-chunks", async (req, res) => {
    try {
        const { fileName, totalChunks } = req.body;
        const chunkDir = path.join("uploads/chunks", fileName);
        const finalPath = path.join("uploads", Date.now() + "_" + fileName);

        const writeStream = fs.createWriteStream(finalPath);

        for (let i = 0; i < totalChunks; i++) {
            const chunkPath = path.join(chunkDir, `${i}`);
            const data = fs.readFileSync(chunkPath);
            writeStream.write(data);
            fs.unlinkSync(chunkPath);
        }

        writeStream.end();
        fs.rmdirSync(chunkDir);

        // Save file record
        const fileData = new File({
            filePath: finalPath,
            shortCode: Math.random().toString(36).substring(2, 8)
        });
        await fileData.save();

        let fileUrl = `${req.protocol}://${req.get('host')}/files/${fileData.shortCode}`;
        res.json({ status: "merged", file_url: fileUrl });
    } catch (err) {
        console.error("Merge error:", err);
        res.status(500).json({ error: "Failed to merge chunks" });
    }
});

// ---------- DOWNLOAD FILE ----------
router.get('/files/:shortCode', async (req, res) => {
    try {
        const { shortCode } = req.params;
        console.log(`Request for shortCode: ${shortCode}`); // Debug log
        const fileData = await File.findOne({ shortCode });
        if (!fileData) {
            console.log(`File not found for shortCode: ${shortCode}`);
            return res.status(404).send('File not found');
        }

        if (fileData.createdAt < Date.now() - 24 * 60 * 60 * 1000) {
            console.log(`File expired for shortCode: ${shortCode}`);
            return res.status(410).send('File has expired');
        }

        const absolutePath = path.join(__dirname, '..', fileData.filePath);
        if (!fs.existsSync(absolutePath)) {
            console.log(`File missing on disk: ${absolutePath}`);
            return res.status(404).send('File not found on server');
        }

        const stats = fs.statSync(absolutePath);
        console.log(`Serving file: ${absolutePath}, Size: ${stats.size}`); // Debug log

        res.setHeader("Content-Disposition", `attachment; filename="${path.basename(absolutePath)}"`);
        res.setHeader("Content-Type", "application/octet-stream");
        res.setHeader("Content-Length", stats.size);
        res.setHeader("Accept-Ranges", "bytes");

        const readStream = fs.createReadStream(absolutePath);
        readStream.on('error', (err) => {
            if (!res.headersSent) {
                console.error("Stream error:", err);
                res.status(500).send("Error streaming file");
            }
        });
        readStream.pipe(res);

        req.on('aborted', () => {
            console.log("Client aborted download");
            readStream.destroy();
        });
    } catch (err) {
        if (!res.headersSent) {
            console.error("Download error:", err);
            res.status(500).send('Server Error');
        }
    }
});

// ---------- CRON CLEANUP ----------
cron.schedule("0 1 * * *", async () => {
    try {
        const files = await File.find();
        for (let file of files) {
            if (file.createdAt < Date.now() - 24 * 60 * 60 * 1000) {
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
