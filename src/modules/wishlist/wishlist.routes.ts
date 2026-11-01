import { Router } from 'express';
import { authenticate } from '@/middlewares/auth.middleware';
import { wishlistController } from './wishlist.controller';

export const wishlistRouter = Router();

// All wishlist endpoints require authentication
wishlistRouter.use(authenticate);

wishlistRouter.get('/', wishlistController.getWishlist);
wishlistRouter.post('/items', wishlistController.addItem);
wishlistRouter.post('/items/:variantId/move-to-cart', wishlistController.moveToCart);
wishlistRouter.delete('/items/:variantId', wishlistController.removeItem);
