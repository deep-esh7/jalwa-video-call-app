// src/routes/gifts.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const GiftController = require('../controllers/GiftController');

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB max file size
  },
  fileFilter: (req, file, cb) => {
    const allowedMimeTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JPEG, PNG, GIF, and WEBP are allowed.'));
    }
  },
});

// Gift routes
router.post('/', upload.single('image'), GiftController.createGift);
router.get('/', GiftController.getAllGifts);
router.get('/:id', GiftController.getGiftById);
router.put('/:id', GiftController.updateGift);
router.delete('/:id', GiftController.deleteGift);

module.exports = router;


