const mongoose = require('mongoose');

const fileSchema = new mongoose.Schema({
    filePath: { type: String, required: true },
    shortCode: { type: String, required: true, unique: true },
    createdAt: { type: Date, default: Date.now }
});

const File = mongoose.model('File', fileSchema);

module.exports = File;