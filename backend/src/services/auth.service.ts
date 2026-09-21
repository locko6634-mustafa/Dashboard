import argon2 from 'argon2';
import jwt from 'jsonwebtoken';
import { ENV } from '../config/env.config.js';
import { prisma } from '../config/prisma.js';

export class AuthService {
  static async login(email: string, password: string) {
    const tenant = await prisma.tenant.findUnique({
      where: { email },
    });

    if (!tenant) {
      throw { status: 401, message: 'Geçersiz e-posta veya şifre' };
    }

    let isPasswordValid = false;

    // Check if password hash is argon2 or plain text legacy
    if (tenant.password_hash.startsWith('$argon2')) {
      isPasswordValid = await argon2.verify(tenant.password_hash, password);
    } else {
      // Legacy plaintext comparison
      isPasswordValid = tenant.password_hash === password;
      if (isPasswordValid) {
        // Transparent upgrade to Argon2
        try {
          const hashed = await argon2.hash(password);
          await prisma.tenant.update({
            where: { id: tenant.id },
            data: { password_hash: hashed },
          });
        } catch (hashErr) {
          console.warn('Failed to upgrade password hash:', hashErr);
        }
      }
    }

    if (!isPasswordValid) {
      throw { status: 401, message: 'Geçersiz e-posta veya şifre' };
    }

    // Generate JWT
    const token = jwt.sign(
      {
        id: tenant.id,
        tenant_id: tenant.id,
        email: tenant.email,
        salon_adi: tenant.salon_adi,
      },
      ENV.JWT_SECRET,
      { expiresIn: '30d' }
    );

    return {
      success: true,
      tenant_id: tenant.id,
      token,
      salon_adi: tenant.salon_adi,
      email: tenant.email,
    };
  }
}
