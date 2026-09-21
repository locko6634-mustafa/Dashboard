import { prisma } from '../config/prisma.js';

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

  static async updateSettings(tenantId: string, payload: any) {
    let settingsToUpdate: Array<{ setting_key: string; setting_value: any }> = [];

    if (Array.isArray(payload)) {
      settingsToUpdate = payload;
    } else if (payload && typeof payload === 'object') {
      if (Array.isArray(payload.payload)) {
        settingsToUpdate = payload.payload;
      } else if (Array.isArray(payload.settings)) {
        settingsToUpdate = payload.settings;
      } else if (payload.setting_key && payload.setting_value) {
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
        await prisma.appSetting.upsert({
          where: {
            setting_key_tenant_id: {
              setting_key: item.setting_key,
              tenant_id: tenantId,
            },
          },
          update: {
            setting_value: item.setting_value,
            updated_at: new Date(),
          },
          create: {
            setting_key: item.setting_key,
            tenant_id: tenantId,
            setting_value: item.setting_value,
            updated_at: new Date(),
          },
        });
      }
    }

    return { success: true, count: settingsToUpdate.length };
  }
}
