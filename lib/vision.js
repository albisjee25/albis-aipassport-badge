// 本机 macOS Vision 图像处理助手：
//   1. decodeQrFromImage(buf): 本地从微信/企业微信名片截图中提取短链 URL（不联网、不上传）
//   2. cutoutPortrait(buf):    本地全彩人像透明抠图（严禁黑白/灰度，保留 100% 原始全彩），
//                              输出 288x288 PNG（Web 预览）与 144x144 RGB565A8（62,208 B 固件直刷）
import { execFile } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

const SWIFT_SOURCE = `
import Foundation
import Vision
import AppKit
import CoreImage

func decodeQR(path: String) {
    guard let img = NSImage(contentsOfFile: path),
          let cg = img.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
        fputs("ERR: cannot open image\\n", stderr)
        exit(2)
    }
    let req = VNDetectBarcodesRequest()
    req.symbologies = [.qr]
    let handler = VNImageRequestHandler(cgImage: cg, options: [:])
    do {
        try handler.perform([req])
    } catch {
        fputs("ERR: vision qr failed: \\(error)\\n", stderr)
        exit(3)
    }
    for obs in (req.results ?? []) {
        if let s = obs.payloadStringValue, !s.isEmpty {
            print(s)
            exit(0)
        }
    }
    fputs("ERR: no qr found\\n", stderr)
    exit(4)
}

func cutoutPortrait(inPath: String, outPath: String) {
    guard let ciInput = CIImage(contentsOf: URL(fileURLWithPath: inPath)) else {
        fputs("ERR: cannot load image\\n", stderr)
        exit(2)
    }
    if #available(macOS 14.0, *) {
        let req = VNGenerateForegroundInstanceMaskRequest()
        let handler = VNImageRequestHandler(ciImage: ciInput, options: [:])
        do {
            try handler.perform([req])
            guard let res = req.results?.first else {
                fputs("ERR: no foreground subject\\n", stderr)
                exit(5)
            }
            let maskBuf = try res.generateScaledMaskForImage(forInstances: res.allInstances, from: handler)
            let maskImg = CIImage(cvPixelBuffer: maskBuf)
            let blend = CIFilter(name: "CIBlendWithMask")!
            blend.setValue(ciInput, forKey: kCIInputImageKey)
            blend.setValue(CIImage.empty(), forKey: kCIInputBackgroundImageKey)
            blend.setValue(maskImg, forKey: kCIInputMaskImageKey)
            guard let outCi = blend.outputImage else { exit(6) }
            let ctx = CIContext()
            guard let cgOut = ctx.createCGImage(outCi, from: ciInput.extent) else { exit(6) }
            let rep = NSBitmapImageRep(cgImage: cgOut)
            guard let png = rep.representation(using: .png, properties: [:]) else { exit(6) }
            try png.write(to: URL(fileURLWithPath: outPath))
            exit(0)
        } catch {
            fputs("ERR: cutout failed: \\(error)\\n", stderr)
            exit(5)
        }
    } else {
        fputs("ERR: macOS 14+ required for Vision cutout\\n", stderr)
        exit(7)
    }
}

let args = CommandLine.arguments
if args.count >= 3 && args[1] == "qr" {
    decodeQR(path: args[2])
} else if args.count >= 4 && args[1] == "cutout" {
    cutoutPortrait(inPath: args[2], outPath: args[3])
} else {
    fputs("Usage: cb-vision qr <imgPath> | cutout <inPath> <outPngPath>\\n", stderr)
    exit(1)
}
`

const PY_CONVERT = `
import sys
from PIL import Image, ImageFilter
import numpy as np

in_png, out_web_png, out_fw_raw = sys.argv[1], sys.argv[2], sys.argv[3]
im = Image.open(in_png).convert("RGBA")

def erode_mask(mask_bool, iters):
    m = mask_bool.copy()
    for _ in range(iters):
        if not m.any():
            break
        p = np.pad(m, 1, mode="constant", constant_values=False)
        m = (
            p[0:-2, 0:-2] & p[0:-2, 1:-1] & p[0:-2, 2:] &
            p[1:-1, 0:-2] & p[1:-1, 1:-1] & p[1:-1, 2:] &
            p[2:,   0:-2] & p[2:,   1:-1] & p[2:,   2:]
        )
    return m

def clean_and_bleed(src_im, erode_alpha_px=0, erode_rgb_px=1, bleed_iters=10):
    rgba = src_im.convert("RGBA")
    if erode_alpha_px > 0:
        r_ch, g_ch, b_ch, a_ch = rgba.split()
        # Gently erode outer matting halo (e.g. grey studio backdrop bleed) before feathering
        for _ in range(erode_alpha_px):
            a_ch = a_ch.filter(ImageFilter.MinFilter(3))
        rgba = Image.merge("RGBA", (r_ch, g_ch, b_ch, a_ch))
    arr = np.array(rgba, dtype=np.float32)
    a = arr[:, :, 3]
    # Remove faint background haze and sharpen semi-transparent silhouette edge
    a_clean = np.clip((a - 48.0) * (255.0 / 172.0), 0.0, 255.0)
    rgb = arr[:, :, :3].copy()
    # Seed RGB from deep solid interior (eroded away from backdrop-contaminated outer ring)
    solid = a_clean >= 240.0
    valid = erode_mask(solid, erode_rgb_px) if erode_rgb_px > 0 else solid
    if not valid.any():
        valid = solid
    if valid.any():
        cur_rgb = rgb.copy()
        cur_valid = valid.copy()
        h, w = cur_valid.shape
        for _ in range(bleed_iters):
            need = ~cur_valid
            if not need.any():
                break
            acc = np.zeros_like(cur_rgb)
            cnt = np.zeros((h, w), dtype=np.float32)
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    if dy == 0 and dx == 0:
                        continue
                    ys = slice(max(0, -dy), h - max(0, dy))
                    xs = slice(max(0, -dx), w - max(0, dx))
                    yd = slice(max(0, dy), h - max(0, -dy))
                    xd = slice(max(0, dx), w - max(0, -dx))
                    m = cur_valid[ys, xs]
                    acc[yd, xd] += cur_rgb[ys, xs] * m[:, :, None]
                    cnt[yd, xd] += m
            fill = need & (cnt > 0)
            if not fill.any():
                break
            cur_rgb[fill] = acc[fill] / cnt[fill, None]
            cur_valid[fill] = True
        # Overwrite contaminated boundary + transparent pixels with pure interior foreground RGB
        fringe = ~valid
        rgb[fringe] = cur_rgb[fringe]
    out = np.zeros((arr.shape[0], arr.shape[1], 4), dtype=np.uint8)
    out[:, :, :3] = np.clip(np.round(rgb), 0, 255).astype(np.uint8)
    out[:, :, 3] = np.clip(np.round(a_clean), 0, 255).astype(np.uint8)
    return Image.fromarray(out, "RGBA")

# Full-res decontamination: shave 2px of studio background halo & bleed RGB from 4px deep interior
erode_px = 2 if min(im.size) >= 400 else 1
im = clean_and_bleed(im, erode_alpha_px=erode_px, erode_rgb_px=erode_px + 2, bleed_iters=14)
# Crop tightly to non-transparent pixels (a >= 16)
alpha_mask = np.array(im)[:, :, 3] >= 16
ys, xs = np.where(alpha_mask)
if len(ys) > 0:
    im = im.crop((int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1))

def fit_bust(src, size):
    w, h = src.size
    scale = min((size - 4) / w, (size - 2) / h)
    nw, nh = max(1, int(round(w * scale))), max(1, int(round(h * scale)))
    # Resize RGB and Alpha separately to prevent LANCZOS dark premultiplication fringe
    arr = np.array(src, dtype=np.uint8)
    rgb_im = Image.fromarray(arr[:, :, :3], "RGB").resize((nw, nh), Image.Resampling.LANCZOS)
    alp_im = Image.fromarray(arr[:, :, 3], "L").resize((nw, nh), Image.Resampling.LANCZOS)
    r_arr = np.dstack([np.array(rgb_im), np.array(alp_im)])
    out = np.zeros((size, size, 4), dtype=np.uint8)
    ox, oy = (size - nw) // 2, size - nh
    out[oy:oy + nh, ox:ox + nw] = r_arr
    # Bleed RGB into transparent padding ring so LVGL bilinear scaling never samples black 0x0000
    return clean_and_bleed(Image.fromarray(out, "RGBA"), erode_alpha_px=0, erode_rgb_px=1, bleed_iters=8)

fit_bust(im, 288).save(out_web_png, optimize=True)
fw = fit_bust(im, 144)
arr = np.array(fw, dtype=np.uint8)
r = arr[:, :, 0].astype(np.uint16)
g = arr[:, :, 1].astype(np.uint16)
b = arr[:, :, 2].astype(np.uint16)
a = arr[:, :, 3]
rgb565 = ((r >> 3) << 11) | ((g >> 2) << 5) | (b >> 3)
raw = rgb565.astype("<u2").tobytes() + a.tobytes()
with open(out_fw_raw, "wb") as f:
    f.write(raw)
`

let cachedBin = null

async function ensureVisionBinary(cacheDir) {
  if (cachedBin && existsSync(cachedBin)) return cachedBin
  if (process.platform !== 'darwin') return null
  const binDir = cacheDir ? join(cacheDir, 'bin') : join(tmpdir(), 'cb-vision-bin')
  mkdirSync(binDir, { recursive: true })
  const binPath = join(binDir, 'cb-vision-v1')
  if (existsSync(binPath)) {
    cachedBin = binPath
    return binPath
  }
  const srcPath = join(binDir, 'cb-vision.swift')
  writeFileSync(srcPath, SWIFT_SOURCE, 'utf8')
  await execFileAsync('swiftc', ['-O', srcPath, '-o', binPath], { timeout: 60000 })
  cachedBin = binPath
  return binPath
}

export async function decodeQrFromImage(imageBuf, { cacheDir } = {}) {
  const bin = await ensureVisionBinary(cacheDir)
  if (!bin) throw new Error('当前系统暂不支持本地二维码截图识别，请直接粘贴短链')
  const work = mkdtempSync(join(tmpdir(), 'cb-qr-'))
  try {
    const inFile = join(work, 'in.img')
    writeFileSync(inFile, imageBuf)
    const { stdout } = await execFileAsync(bin, ['qr', inFile], { timeout: 15000 })
    const url = stdout.trim()
    if (!url) throw new Error('未在图片中识别到二维码')
    return url
  } catch (e) {
    const msg = String(e.stderr || e.message || '')
    if (msg.includes('no qr found')) throw new Error('图片里没有识别到清晰二维码，请换一张完整的微信名片码截图')
    throw new Error(msg.includes('ERR:') ? msg.split('ERR:')[1].trim() : '二维码识别失败')
  } finally {
    rmSync(work, { recursive: true, force: true })
  }
}

export async function cutoutPortrait(imageBuf, { cacheDir } = {}) {
  const work = mkdtempSync(join(tmpdir(), 'cb-cut-'))
  try {
    const inFile = join(work, 'in.img')
    const cutoutPng = join(work, 'cutout.png')
    const webPng = join(work, 'web.png')
    const fwRaw = join(work, 'fw.rgb565a8')
    writeFileSync(inFile, imageBuf)

    let stagePng = inFile
    const bin = await ensureVisionBinary(cacheDir)
    if (bin) {
      try {
        await execFileAsync(bin, ['cutout', inFile, cutoutPng], { timeout: 25000 })
        if (existsSync(cutoutPng)) stagePng = cutoutPng
      } catch {
        // 如果图片本身就是透明 PNG 或无前景主体，退回原图直接规范缩放
        stagePng = inFile
      }
    }

    await execFileAsync('python3', ['-c', PY_CONVERT, stagePng, webPng, fwRaw], { timeout: 20000 })
    return {
      png: readFileSync(webPng),
      rgb565a8: readFileSync(fwRaw),
    }
  } finally {
    rmSync(work, { recursive: true, force: true })
  }
}
