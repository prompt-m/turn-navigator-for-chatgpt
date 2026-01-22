// scripts/release.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const root = path.resolve(__dirname, "..");

const pkg = JSON.parse(
  fs.readFileSync(path.join(root, "package.json"), "utf8"),
);
const version = pkg.version; // ここが唯一の正

// 日付は “今日” を自動で入れる（version_name用）
const now = new Date();
const yyyy = now.getFullYear();
const mm = String(now.getMonth() + 1).padStart(2, "0");
const dd = String(now.getDate()).padStart(2, "0");
const dateTag = `${yyyy}-${mm}-${dd}`;

// public/manifest.json を読み→書き換え
const manifestPath = path.join(root, "public", "manifest.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

manifest.version = version;
manifest.version_name = `${version} (${dateTag})`;

fs.writeFileSync(
  manifestPath,
  JSON.stringify(manifest, null, 2) + "\n",
  "utf8",
);
console.log(
  `✅ manifest.json updated: version=${manifest.version}, version_name=${manifest.version_name}`,
);

// release/ を作り直し
const releaseDir = path.join(root, "release");
fs.rmSync(releaseDir, { recursive: true, force: true });
fs.mkdirSync(releaseDir, { recursive: true });

// 配布に必要なものを public/ と dist/ から集める
const copy = (src, dst) => {
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(src, dst);
};

const copyDir = (srcDir, dstDir) => {
  fs.mkdirSync(dstDir, { recursive: true });
  for (const ent of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const s = path.join(srcDir, ent.name);
    const d = path.join(dstDir, ent.name);
    if (ent.isDirectory()) copyDir(s, d);
    else copy(s, d);
  }
};

// public → release（manifest/options/icons/assets 等）
copyDir(path.join(root, "public"), releaseDir);

// dist の JS を release へ上書き（TSビルド成果物が正）
copyDir(path.join(root, "dist"), releaseDir);

// ZIP 名固定：release/TurnNavigator-<version>.zip（出力先も固定）
const zipName = `TurnNavigator-${version}.zip`;
const zipPath = path.join(root, "release", zipName);

// PowerShell の Compress-Archive を使う（Windows想定）
const cwd = root.replace(/\\/g, "/");
const rel = "release";
execSync(
  `powershell -NoProfile -Command "if(Test-Path '${zipPath}') { Remove-Item -Force '${zipPath}' }; Compress-Archive -Path '${path.join(
    root,
    "release",
    "*",
  )}' -DestinationPath '${zipPath}'"`,
  { stdio: "inherit" },
);

console.log(`✅ Release ready: ${releaseDir}`);
console.log(`✅ Zip created : ${zipPath}`);
