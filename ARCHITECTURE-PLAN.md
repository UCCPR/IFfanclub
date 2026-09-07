# 网页静态版结构与构建规划

基准：`G:\WorkbuddyProject\AGC` 的 `static/` 静态版。目标是在不引入 AGC 在线服务端、Redis、WASM 或多人模块的前提下，采用相同的目录边界、构建时生成和 GitHub Pages 发布原则。

## 1. 边界

- `pages-demo/` 是网页版唯一根目录；复制这个目录即可安装、开发、构建和预览。
- 网页构建不得读取仓库根目录的 `iconimage/`、`level/`、机器人源码、`info/`、`backup/`、`config.py`、录像或 `code_backups/`。
- `assets/` 是可提交的权威资源源；`public/` 是构建前生成的运行资源；`dist/` 是最终产物。禁止直接修改 `public/cards`、`public/art`、`public/gacha` 和 `dist`。
- 浏览器存档只使用 `localStorage`，与 QQ 机器人存档完全隔离。

## 2. 目标目录

```text
pages-demo/
├─ src/                         # 第二阶段统一后的应用源码
│  ├─ app/                     # 应用壳、入口、全局样式
│  ├─ features/gacha/          # 卡池、票券、过场、揭示、结果
│  │  ├─ components/
│  │  ├─ presentation/         # 逐镜头时序与突变规则
│  │  ├─ audio/                # BGM/SE 生命周期与映射
│  │  └─ styles/
│  ├─ shared/                  # 卡牌类型、存档、纯逻辑
│  └─ generated/               # 构建时生成，禁止手改/提交
├─ assets/                      # 权威、可追溯、构建必需资源
│  ├─ cards/thumb/             # 794 张优化缩略 WebP
│  ├─ cards/reveal/            # 794 张高清揭示 WebP
│  ├─ gacha/                   # 白名单 UI 原始 PNG
│  └─ media/                   # 经确认使用的 MP4/M4A 源
├─ public/                      # prepare-assets 生成的运行树
│  ├─ cards/  art/  gacha/  media/
│  └─ 固定站点文件
├─ scripts/
│  ├─ prepare-assets.mjs       # assets → public
│  ├─ verify-build.mjs         # 发布白名单、敏感目录、base path
│  └─ serve.mjs                # 只预览 dist
├─ spec/                       # 现有逻辑验证，后续按功能归档
├─ docs/                       # 静态版说明、资源清单、时间轴
├─ package.json
├─ vite.config.ts
├─ tsconfig.json
└─ dist/                       # vite 生成，禁止提交
```

第一阶段保留现有 `app/ components/ hooks/ lib/ dev/` 路径，待行为稳定后再机械迁入 `src/`，不在视觉复刻过程中同时改写全部 import。

## 3. 构建标准

流程固定为单向：

```text
assets + lib/cards.json + lib/gacha-assets.json
  → predev/prebuild: prepare-assets.mjs
  → public 白名单运行资源
  → typecheck
  → vite build
  → dist/client
  → verify-build.mjs
  → GitHub Pages artifact
```

- `dev` 与 `build` 必须运行同一资源准备脚本，避免开发环境和 Pages 资源不同。
- Pages base path 只由 `PAGES_BASE_PATH`/Vite 配置控制，源码不得硬编码仓库外绝对路径。
- `preview` 只提供 `dist/client`，不能把源码目录作为静态根目录。
- 构建失败时不保留半成品发布；`verify-build` 必须确认所有显式媒体、794 张卡图、全部 UI 白名单和 HTML 引用存在。
- 版本信息后续采用 AGC 模式：包版本 + main 第一父提交数；资源版本另设，不与产品版本混用。

## 4. 资源管理标准

- 卡图清单是唯一选择入口；只保留实际引用的 794 张，不复制整个 979 张原库或 4GB 宽幅库。
- UI 必须通过 `gacha-assets.json` 白名单进入构建，不允许脚本递归复制未知素材目录。
- 音视频必须通过 `gacha-media.ts` 明确命名和引用，不允许把录像、抽帧、分析文件带入发布物。
- `public/cards`、`public/art`、`public/gacha` 可随时删除并由 `assets/` 重建。
- `verify-build` 保持目录白名单，并继续拒绝 `info`、`backup`、`agentmd`、`.git`、`.env`、`config.py`、`config.json`、符号链接与开发复核代码。
- 新资源加入顺序：原始用途确认 → 清单登记 → 生成优化版 → 页面接入 → 构建产物核查；禁止先把整个素材包放进 `public/`。

## 5. 实施阶段

### Phase A：自包含（本轮）

- 将 794 张缩略图与 794 张揭示图纳入 `assets/cards/`。
- 将原先来自根 `level/` 的 16 张 UI PNG 纳入 `assets/gacha/`。
- `prepare-assets.mjs` 仅从 `pages-demo/` 内读取。
- 更新 README、资源清单和构建验证。

验收：临时复制 `pages-demo/` 到独立路径后，安装依赖即可完成 typecheck/build；根 `iconimage/` 与 `level/` 不参与构建。

### Phase B：源码分层

- 已建立最后加载的 `app/pool-authoritative.css`，先隔离固定画布、响应式可见性和原生字号；后续逐段删除 `globals.css` 中被其覆盖的旧卡池规则。
- 将页面壳与抽卡功能拆到 `src/app`、`src/features/gacha`、`src/shared`。
- 把 3,000 行级联 CSS 拆成 tokens、stage、dialog、cinema、responsive 五层，删除被后置规则覆盖的旧样式。
- 保持现有 DOM、动画时间轴和素材映射不变，只进行路径迁移。

验收：构建文件数、卡图数、媒体白名单和关键逐镜头时间点迁移前后相同。

### Phase C：生成数据

- 建立卡牌公开数据生成脚本，输出到 `src/generated/cards.ts`。
- 权威卡牌数据与 UI/媒体清单分开；应用不得直接读取 Excel 或机器人存档。
- generated 目录加入忽略规则，开发和构建前自动重建。

### Phase D：Pages 工作流（已具备）

- 独立 workflow 只安装网页包依赖、执行类型检查和生产构建；构建末尾自动执行发布白名单核验。
- 独立仓库上传路径固定为 `dist/client`。
- workflow 使用只读 contents、pages write、id-token write 权限和 Pages concurrency。
- main 推送触发部署，同时保留手动触发；不上传源码外的本地用户数据。

## 6. 暂不采用的 AGC 部分

- 不引入 `server/`、数据库、Redis、Socket.IO、Docker 或 `pow-wasm/`。
- 不为了目录相似而强制迁移 QQ 机器人到 TypeScript workspace。
- 在根 npm 入口仍服务机器人时，不立即把整个仓库切换到 pnpm；若未来统一，必须单独迁移并验证机器人入口。
