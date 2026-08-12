# 用途別画像リサイズ

GitHub Pagesでそのまま公開できる、ブラウザ完結型の画像リサイズツールです。

## リポジトリへ入れるファイル

- `index.html`
- `styles.css`
- `app.js`
- `jszip.min.js`

4ファイルをリポジトリ直下へ配置してください。

## GitHub Pagesの設定

1. GitHubの対象リポジトリを開く
2. `Settings` → `Pages`
3. `Build and deployment` の Sourceを `Deploy from a branch` にする
4. Branchを `main`、フォルダを `/(root)` にする
5. `Save`

## 主な機能

- Googleマップ：1200 × 1200
- X：正方形／横型
- LINE：1040 × 1040
- モニター：1920 × 1080
- A4／A3：縦・横、300dpi相当
- 任意サイズ
- 余白追加／中央トリミング／引き伸ばし
- PNG／JPG
- 透明余白／背景色指定
- 複数画像のZIP保存

画像処理は利用者のブラウザ内で行われ、画像を外部サーバーへ送信しません。
