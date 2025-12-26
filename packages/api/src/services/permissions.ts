import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import {
  userPermissions,
  type UserPermissions,
  type NewUserPermissions,
} from "../db/schema.js";
import { logger } from "../utils/logger.js";

/**
 * Permissions Service
 * Manages user permissions and access control
 */
class PermissionsService {
  /**
   * Get permissions for a user
   * Creates default permissions if they don't exist
   */
  async getPermissions(userId: string): Promise<UserPermissions> {
    try {
      const result = await db
        .select()
        .from(userPermissions)
        .where(eq(userPermissions.userId, userId))
        .limit(1);

      if (result.length > 0) {
        return result[0];
      }

      // Create default permissions for this user
      const defaultPermissions: NewUserPermissions = {
        userId,
        canDeleteDownloads: false,
        canConfigureNotifications: false,
        canManageRequests: true,
        canConfigureApp: false,
        canConfigureIntegrations: false,
        canConfigureEmail: false,
        canSeeDownloadOwner: false,
        canManageApiKeys: false,
      };

      const created = await db
        .insert(userPermissions)
        .values(defaultPermissions)
        .returning();

      logger.info(`Created default permissions for user: ${userId}`);
      return created[0];
    } catch (error) {
      logger.error(`Failed to get permissions for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Update permissions for a user
   */
  async updatePermissions(
    userId: string,
    updates: Partial<Omit<UserPermissions, "userId">>,
  ): Promise<UserPermissions> {
    try {
      // Ensure permissions exist first
      await this.getPermissions(userId);

      const result = await db
        .update(userPermissions)
        .set(updates)
        .where(eq(userPermissions.userId, userId))
        .returning();

      logger.info(`Updated permissions for user: ${userId}`);
      return result[0];
    } catch (error) {
      logger.error(`Failed to update permissions for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Check if a user can access a specific resource
   * @param userId - The user trying to access the resource
   * @param resourceOwnerId - The owner of the resource
   * @param isAdmin - Whether the user is an admin
   * @returns true if user can access the resource
   */
  canAccessResource(
    userId: string,
    resourceOwnerId: string,
    isAdmin: boolean,
  ): boolean {
    // Admins can access all resources
    if (isAdmin) {
      return true;
    }

    // Users can only access their own resources
    return userId === resourceOwnerId;
  }

  /**
   * Check if a user can perform a specific action based on their permissions
   */
  async canPerform(
    userId: string,
    permission: keyof Omit<UserPermissions, "userId">,
  ): Promise<boolean> {
    try {
      const permissions = await this.getPermissions(userId);
      return permissions[permission] === true;
    } catch (error) {
      logger.error(
        `Failed to check permission ${permission} for user ${userId}:`,
        error,
      );
      return false;
    }
  }

  /**
   * Create default permissions for admin user
   */
  async createAdminPermissions(userId: string): Promise<UserPermissions> {
    const adminPermissions: NewUserPermissions = {
      userId,
      canDeleteDownloads: true,
      canConfigureNotifications: true,
      canManageRequests: true,
      canConfigureApp: true,
      canConfigureIntegrations: true,
      canConfigureEmail: true,
      canSeeDownloadOwner: true,
      canManageApiKeys: true,
    };

    try {
      const result = await db
        .insert(userPermissions)
        .values(adminPermissions)
        .returning();

      logger.info(`Created admin permissions for user: ${userId}`);
      return result[0];
    } catch (error) {
      logger.error(
        `Failed to create admin permissions for user ${userId}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Delete permissions for a user (cascades on user deletion)
   */
  async deletePermissions(userId: string): Promise<boolean> {
    try {
      const result = await db
        .delete(userPermissions)
        .where(eq(userPermissions.userId, userId))
        .returning();

      if (result.length > 0) {
        logger.info(`Deleted permissions for user: ${userId}`);
        return true;
      }

      return false;
    } catch (error) {
      logger.error(`Failed to delete permissions for user ${userId}:`, error);
      throw error;
    }
  }
}

export const permissionsService = new PermissionsService();
