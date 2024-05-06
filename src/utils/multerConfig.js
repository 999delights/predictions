const multer = require('multer');

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/'); // Specify the directory where uploaded files should be stored
    },
    filename: function (req, file, cb) {
        cb(null, file.originalname); // Use the original file name for the uploaded file
    }
});

const upload = multer({ storage: storage });

module.exports = upload;
