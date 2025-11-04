// src/services/GiftService.js
const { PrismaClient } = require('@prisma/client');
const logger = require('../config/logger');
const https = require('https');
const http = require('http');
const config = require('../config/environment');

const prisma = new PrismaClient();

class GiftService {
  /**
   * Upload image to R2 bucket
   * @param {Buffer} imageBuffer - Image file buffer
   * @param {string} imageName - Original image name
   * @returns {Promise<string>} - Public URL of uploaded image
   */
  async uploadImageToR2(imageBuffer, imageName) {
    try {
      const r2WorkerUrl = config.r2WorkerUrl;
      
      if (!r2WorkerUrl) {
        throw new Error('R2_WORKER_URL not configured');
      }

      // Convert buffer to base64
      const imageBase64 = imageBuffer.toString('base64');
      
      // Generate a unique ID for the gift image
      const giftId = `gift-${Date.now()}-${Math.random().toString(36).substring(7)}`;
      
      const payload = JSON.stringify({
        userId: giftId,
        imageName: imageName,
        imageBase64: imageBase64,
      });

      const url = new URL(`${r2WorkerUrl}/upload`);
      const isHttps = url.protocol === 'https:';
      const client = isHttps ? https : http;

      return new Promise((resolve, reject) => {
        const options = {
          hostname: url.hostname,
          port: url.port || (isHttps ? 443 : 80),
          path: url.pathname,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payload),
          },
        };

        const req = client.request(options, (res) => {
          let data = '';

          res.on('data', (chunk) => {
            data += chunk;
          });

          res.on('end', () => {
            try {
              const response = JSON.parse(data);
              
              if (res.statusCode >= 200 && res.statusCode < 300 && response.url) {
                logger.info(`✅ Image uploaded to R2: ${response.url}`);
                resolve(response.url);
              } else {
                logger.error(`R2 upload failed: ${data}`);
                reject(new Error(response.error || 'Failed to upload image to R2'));
              }
            } catch (parseError) {
              logger.error('Failed to parse R2 response:', parseError);
              reject(new Error('Invalid response from R2 worker'));
            }
          });
        });

        req.on('error', (error) => {
          logger.error('R2 upload request error:', error);
          reject(error);
        });

        req.write(payload);
        req.end();
      });
    } catch (error) {
      logger.error('Error uploading to R2:', error);
      throw error;
    }
  }

  /**
   * Create a new gift with image upload
   * @param {string} name - Gift name
   * @param {number} cost - Gift cost in coins
   * @param {Buffer} imageBuffer - Image file buffer
   * @param {string} imageName - Original image name
   * @returns {Promise<Object>} - Created gift object
   */
  async createGift(name, cost, imageBuffer, imageName) {
    try {
      logger.info(`Creating gift: ${name} with cost: ${cost}`);

      // Upload image to R2
      const imageUrl = await this.uploadImageToR2(imageBuffer, imageName);

      // Create gift record in database
      const gift = await prisma.gift.create({
        data: {
          name,
          cost,
          imageUrl,
        },
      });

      logger.info(`✅ Gift created successfully: ${gift.id}`);
      return gift;
    } catch (error) {
      logger.error('Error creating gift:', error);
      throw error;
    }
  }

  /**
   * Get all gifts
   * @returns {Promise<Array>} - List of all gifts
   */
  async getAllGifts() {
    try {
      const gifts = await prisma.gift.findMany({
        orderBy: {
          cost: 'asc',
        },
      });
      return gifts;
    } catch (error) {
      logger.error('Error fetching gifts:', error);
      throw error;
    }
  }

  /**
   * Get gift by ID
   * @param {string} id - Gift ID
   * @returns {Promise<Object>} - Gift object
   */
  async getGiftById(id) {
    try {
      const gift = await prisma.gift.findUnique({
        where: { id },
      });
      return gift;
    } catch (error) {
      logger.error(`Error fetching gift ${id}:`, error);
      throw error;
    }
  }

  /**
   * Update gift
   * @param {string} id - Gift ID
   * @param {Object} data - Update data
   * @returns {Promise<Object>} - Updated gift object
   */
  async updateGift(id, data) {
    try {
      const gift = await prisma.gift.update({
        where: { id },
        data,
      });
      logger.info(`✅ Gift updated: ${id}`);
      return gift;
    } catch (error) {
      logger.error(`Error updating gift ${id}:`, error);
      throw error;
    }
  }

  /**
   * Delete gift
   * @param {string} id - Gift ID
   * @returns {Promise<Object>} - Deleted gift object
   */
  async deleteGift(id) {
    try {
      const gift = await prisma.gift.delete({
        where: { id },
      });
      logger.info(`✅ Gift deleted: ${id}`);
      return gift;
    } catch (error) {
      logger.error(`Error deleting gift ${id}:`, error);
      throw error;
    }
  }
}

module.exports = new GiftService();


