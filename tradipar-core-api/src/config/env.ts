import dotenv from 'dotenv';
dotenv.config();

export const ENV = {
  PORT: process.env.PORT || 3000,
  SANKHYA: {
    CLIENT_ID: process.env.SANKHYA_CLIENT_ID || '',
    CLIENT_SECRET: process.env.SANKHYA_CLIENT_SECRET || '',
    X_TOKEN: process.env.SANKHYA_XTOKEN || '',
    BASE_URL: process.env.SANKHYA_BASE_URL || 'https://api.sandbox.sankhya.com.br'
  },
  HUBSPOT: {
    ACCESS_TOKEN: process.env.HUBSPOT_ACCESS_TOKEN || ''
  }
};
