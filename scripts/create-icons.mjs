import sharp from 'sharp';
import { writeFileSync } from 'node:fs';
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><rect width="512" height="512" rx="100" fill="#215c44"/><g fill="none" stroke="#fff" stroke-width="18" stroke-linecap="round" stroke-linejoin="round"><path d="M341 145c-80-7-171 33-177 105-5 58 31 87 76 80 70-11 96-79 101-185Z"/><path d="M165 358c29-57 77-112 121-155"/><path d="m210 279-3-55m37 20 53 1"/></g></svg>`;
writeFileSync('public/favicon.svg', svg);
for (const size of [192, 512]) await sharp(Buffer.from(svg)).resize(size, size).png().toFile(`public/icon-${size}.png`);
