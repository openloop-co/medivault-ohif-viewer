/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Generic utilities for MONAI Label
 * Based on official MONAI Label OHIF plugin
 */

import { GenericAnatomyColors, GenericNames } from './GenericAnatomyColors';

function getRandomInt(min: number, max: number): number {
  min = Math.ceil(min);
  max = Math.floor(max);
  return Math.floor(Math.random() * (max - min) + min);
}

function randomRGB(toHex = false): { r: number; g: number; b: number } | string {
  const o = Math.round;
  const r = Math.random;
  const s = 255;
  const x = o(r() * s);
  const y = o(r() * s);
  const z = o(r() * s);
  return toHex ? rgbToHex(x, y, z) : { r: x, g: y, b: z };
}

function randomName(): string {
  return GenericNames[getRandomInt(0, GenericNames.length)];
}

function componentToHex(c: number): string {
  const hex = c.toString(16);
  return hex.length === 1 ? '0' + hex : hex;
}

function rgbToHex(r: number, g: number, b: number): string {
  return '#' + componentToHex(r) + componentToHex(g) + componentToHex(b);
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
      }
    : null;
}

function generateIntForString(str: string): number {
  let hash = str.length * 4;
  for (let i = 0; i < str.length; ++i) {
    hash += str.charCodeAt(i);
  }
  return hash;
}

function fixedRGBForLabel(
  str: string,
  toHex = false
): { r: number; g: number; b: number } | string {
  const r = generateIntForString(str);
  const x = (2 * r) % 256;
  const y = (3 * r) % 256;
  const z = (5 * r) % 256;
  return toHex ? rgbToHex(x, y, z) : { r: x, g: y, b: z };
}

/**
 * Get color for a label
 * First checks predefined anatomy colors, then generates a deterministic color
 */
export function getLabelColor(
  label: string,
  rgb = true,
  random = true
): { r: number; g: number; b: number } | string | [number, number, number, number] | null {
  const name = label.toLowerCase();
  for (const i of GenericAnatomyColors) {
    if (i.label === name) {
      const rgbVal = hexToRgb(i.value);
      if (rgb && rgbVal) {
        return [rgbVal.r, rgbVal.g, rgbVal.b, 255];
      }
      return rgb ? rgbVal : i.value;
    }
  }
  if (random) {
    const color = fixedRGBForLabel(label, !rgb);
    if (rgb && typeof color === 'object') {
      return [color.r, color.g, color.b, 255];
    }
    return color;
  }
  return null;
}

export function hideNotification(nid: string | null, notification: any): void {
  if (!nid) {
    if ((window as any).snackbar) {
      (window as any).snackbar.hideAll();
    }
  } else {
    notification.hide(nid);
  }
}

export class CookieUtils {
  static setCookie(
    name: string,
    value: string,
    exp_y?: number,
    exp_m?: number,
    exp_d?: number,
    path?: string,
    domain?: string,
    secure?: boolean
  ): void {
    let cookie_string = name + '=' + encodeURIComponent(value);
    if (exp_y && exp_m !== undefined && exp_d !== undefined) {
      const expires = new Date(exp_y, exp_m, exp_d);
      cookie_string += '; expires=' + expires.toUTCString();
    }
    if (path) {
      cookie_string += '; path=' + encodeURIComponent(path);
    }
    if (domain) {
      cookie_string += '; domain=' + encodeURIComponent(domain);
    }
    if (secure) {
      cookie_string += '; secure';
    }
    document.cookie = cookie_string;
  }

  static getCookie(cookie_name: string): string | null {
    const results = document.cookie.match('(^|;) ?' + cookie_name + '=([^;]*)(;|$)');
    if (results) {
      return decodeURIComponent(results[2]);
    }
    return null;
  }

  static getCookieString(name: string, defaultVal = ''): string {
    const val = CookieUtils.getCookie(name);
    if (!val || val === 'undefined' || val === 'null' || val === '') {
      CookieUtils.setCookie(name, defaultVal);
      return defaultVal;
    }
    return val;
  }

  static getCookieBool(name: string, defaultVal = false): boolean {
    const val = CookieUtils.getCookieString(name, String(defaultVal));
    return !!JSON.parse(String(val).toLowerCase());
  }

  static getCookieNumber(name: string, defaultVal = 0): number {
    const val = CookieUtils.getCookieString(name, String(defaultVal));
    return Number(val);
  }
}

export { getRandomInt, randomRGB, randomName, rgbToHex, hexToRgb };
