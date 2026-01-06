/**
 * Storage Service
 * 
 * Handles file uploads to Supabase Storage
 * Required for Vercel deployment (no local filesystem access)
 * 
 * @module storage/storage.service
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private supabase: SupabaseClient | null = null;
  private readonly bucketName = 'images';

  constructor(private configService: ConfigService) {
    const supabaseUrl = this.configService.get<string>('SUPABASE_URL');
    const supabaseKey = this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY');

    if (supabaseUrl && supabaseKey) {
      this.supabase = createClient(supabaseUrl, supabaseKey);
      this.logger.log('✅ Supabase Storage initialized');
      this.ensureBucketExists();
    } else {
      this.logger.warn('⚠️ Supabase credentials not configured - using fallback base64 mode');
    }
  }

  /**
   * Ensure the images bucket exists
   */
  private async ensureBucketExists(): Promise<void> {
    if (!this.supabase) return;

    try {
      const { data: buckets } = await this.supabase.storage.listBuckets();
      const exists = buckets?.some(b => b.name === this.bucketName);

      if (!exists) {
        const { error } = await this.supabase.storage.createBucket(this.bucketName, {
          public: true,
          fileSizeLimit: 10485760, // 10MB
          allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
        });

        if (error) {
          this.logger.error('Failed to create bucket:', error);
        } else {
          this.logger.log(`✅ Created storage bucket: ${this.bucketName}`);
        }
      }
    } catch (error) {
      this.logger.error('Error checking/creating bucket:', error);
    }
  }

  /**
   * Check if Supabase Storage is available
   */
  isAvailable(): boolean {
    return this.supabase !== null;
  }

  /**
   * Upload an image from base64 data
   * @param base64Data - Base64 encoded image data (without data:image prefix)
   * @param fileName - Desired filename (e.g., 'img_uuid.jpg')
   * @param contentType - MIME type (default: 'image/jpeg')
   * @returns Public URL of the uploaded image
   */
  async uploadImage(
    base64Data: string,
    fileName: string,
    contentType: string = 'image/jpeg',
  ): Promise<string> {
    if (!this.supabase) {
      throw new Error('Supabase Storage not configured');
    }

    try {
      // Convert base64 to buffer
      const buffer = Buffer.from(base64Data, 'base64');
      
      // Upload to Supabase Storage
      const filePath = `generated/${fileName}`;
      const { data, error } = await this.supabase.storage
        .from(this.bucketName)
        .upload(filePath, buffer, {
          contentType,
          upsert: true, // Overwrite if exists
        });

      if (error) {
        this.logger.error('Upload error:', error);
        throw new Error(`Failed to upload image: ${error.message}`);
      }

      // Get public URL
      const { data: urlData } = this.supabase.storage
        .from(this.bucketName)
        .getPublicUrl(filePath);

      this.logger.log(`✅ Image uploaded: ${urlData.publicUrl}`);
      return urlData.publicUrl;
    } catch (error: any) {
      this.logger.error('Storage upload failed:', error);
      throw error;
    }
  }

  /**
   * Delete an image from storage
   * @param fileName - The filename to delete
   */
  async deleteImage(fileName: string): Promise<void> {
    if (!this.supabase) return;

    try {
      const filePath = `generated/${fileName}`;
      await this.supabase.storage.from(this.bucketName).remove([filePath]);
      this.logger.log(`✅ Image deleted: ${fileName}`);
    } catch (error) {
      this.logger.error('Delete failed:', error);
    }
  }
}
