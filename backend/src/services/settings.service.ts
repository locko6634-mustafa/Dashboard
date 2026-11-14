import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../config/prisma.js';

export const settingItemSchema = z.object({
  setting_key: z.string().min(1),
  setting_value: z.unknown(),
});

export const updateSettingsSchema = z.union([
  z.array(settingItemSchema),
  z.object({ payload: z.array(settingItemSchema) }).passthrough(),
  z.object({ settings: z.array(settingItemSchema) }).passthrough(),
  settingItemSchema.passthrough(),
  z.record(z.unknown()),
]);

export type SettingItemInput = z.infer<typeof settingItemSchema>;
export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>;

export class SettingsService {
  static async getSettings(tenantId: string) {
    const settings = await prisma.appSetting.findMany({
      where: { tenant_id: tenantId },
    });

    return settings.map((s) => ({
      setting_key: s.setting_key,
      setting_value: s.setting_value,
      updated_at: s.updated_at,
    }));
  }

  static async updateSettings(tenantId: string, payload: UpdateSettingsInput) {
    let settingsToUpdate: SettingItemInput[] = [];

    if (Array.isArray(payload)) {
      settingsToUpdate = payload;
    } else if (payload && typeof payload === 'object') {
      if ('payload' in payload && Array.isArray(payload.payload)) {
        settingsToUpdate = payload.payload;
      } else if ('settings' in payload && Array.isArray(payload.settings)) {
        settingsToUpdate = payload.settings;
      } else if ('setting_key' in payload && typeof payload.setting_key === 'string' && 'setting_value' in payload) {
        settingsToUpdate = [{ setting_key: payload.setting_key, setting_value: payload.setting_value }];
      } else {
        for (const [key, value] of Object.entries(payload)) {
          if (key !== 'tenant_id') {
            settingsToUpdate.push({ setting_key: key, setting_value: value });
          }
        }
      }
    }

    for (const item of settingsToUpdate) {
      if (item.setting_key) {
        const jsonValue = (item.setting_value ?? null) as Prisma.InputJsonValue;
        await prisma.appSetting.upsert({
          where: {
            setting_key_tenant_id: {
              setting_key: item.setting_key,
              tenant_id: tenantId,
            },
          },
          update: {
            setting_value: jsonValue,
            updated_at: new Date(),
          },
          create: {
            setting_key: item.setting_key,
            tenant_id: tenantId,
            setting_value: jsonValue,
            updated_at: new Date(),
          },
        });
      }
    }

    return { success: true, count: settingsToUpdate.length };
  }
}
