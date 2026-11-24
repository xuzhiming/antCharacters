# 三面図の登録

三面図は `imageLibrary` の部位スロットへ登録せず、`threeViews` と `assets/three-view/` に保存します。`side` は本人の右側、編集画面の `right` ビューに対応します。

`views.json` の相対パスはこの設定ファイルを基準に解決します。

```json
{
  "input": "project.charakit",
  "views": [
    {"view":"front","file":"work/three-view/front.png","prompt":"実際に使った正面の生成指示"},
    {"view":"side","file":"work/three-view/side.png","prompt":"実際に使った本人右側面の生成指示"},
    {"view":"back","file":"work/three-view/back.png","prompt":"実際に使った背面の生成指示"}
  ]
}
```

```text
node scripts/update-three-views.mjs views.json project.charakit
```

入力と同じ正本へ保存します。PNG内の実プロンプト、画像のハッシュを保存し、元絵、部位画像、モデル、配置は保持します。初回登録の画像は `autoFit:true` で保存され、アプリのモデル編集でモデルが用意された時点で一度だけ仮合わせされます。位置・大きさ・透明度・固定・非表示などの既存調整値は再登録時も保持します。

指定した1方向だけの修正ではその1件だけを `views` に入れ、現在の参照アセットの `sha256` を `expectedSha256` に指定します。他方向を再生成しません。画像の描き直しを3Dモデルへの変更済みとは扱いません。

独立した初回ZIP納品は既存の8枚の `images` 設定に、同じ3件を `threeViews` として追加します。`scripts/package-images.mjs` は `three-view/front.png`、`three-view/side.png`、`three-view/back.png` を8枚と同じZIPに入れます。アプリの画像セットZIPの読み込みで三面図も自動登録されます。従来の8枚だけのZIPと旧12枚ZIPも読み込めます。
