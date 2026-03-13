"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ENV = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
exports.ENV = {
    PORT: process.env.PORT || 3000,
    SANKHYA: {
        CLIENT_ID: process.env.SANKHYA_CLIENT_ID || '',
        CLIENT_SECRET: process.env.SANKHYA_CLIENT_SECRET || '',
        X_TOKEN: process.env.SANKHYA_XTOKEN || '',
        BASE_URL: process.env.SANKHYA_BASE_URL || 'https://api.sandbox.sankhya.com.br'
    },
    HUBSPOT: {
        ACCESS_TOKEN: process.env.HUBSPOT_ACCESS_TOKEN || '',
        CLIENT_ID: process.env.HUBSPOT_CLIENT_ID || '',
        CLIENT_SECRET: process.env.HUBSPOT_CLIENT_SECRET || '',
        REFRESH_TOKEN: process.env.HUBSPOT_REFRESH_TOKEN || ''
    }
};
