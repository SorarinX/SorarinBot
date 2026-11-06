# SignPath Foundation 免费代码签名

SorarinBot 已切换到 **AGPL-3.0-only**，满足 SignPath Foundation 的 OSI 许可证要求。
免费证书的发布者会是 **SignPath Foundation**，不是 SorarinBot；这是免费 OSS 签名的正常代价。

> 账号、GitHub 授权和条款确认必须由仓库所有者本人完成，CI 不能代替。

## 1. 申请前检查

- 仓库公开，根目录有完整 `LICENSE`（AGPL-3.0）
- 已有一个公开 Release（当前为 `v3.0.1`）
- 构建全部在 GitHub-hosted runner 上完成
- 没有商业双许可；README / CONTRIBUTING 已移除商业授权说明
- 所有要签的二进制都来自本仓库源码

## 2. 申请

1. 用 GitHub 登录 <https://signpath.org/>
2. 提交 Open Source 项目申请，填写：
   - Project: `SorarinBot`
   - Repository: `https://github.com/SorarinX/SorarinBot`
   - License: `AGPL-3.0-only`
   - Build system: GitHub Actions, `windows-latest`
   - Release: `v3.0.1`
3. 通过后，在 SignPath 中创建：
   - Organization
   - Project `sorarinbot`
   - Signing policy `release-signing`
   - 安装 SignPath GitHub App，允许访问本仓库
4. 创建 API token（submitter 权限），保存到 GitHub Secrets：
   - `SIGNPATH_API_TOKEN`
   - `SIGNPATH_ORGANIZATION_ID`

## 2.1 申请表单可直接填

```text
Project name: SorarinBot
Repository: https://github.com/SorarinX/SorarinBot
License: AGPL-3.0-only
Primary language: Go / TypeScript
Build system: GitHub Actions
Workflow: .github/workflows/release.yml
Runner: windows-latest
Release: https://github.com/SorarinX/SorarinBot/releases/tag/v3.0.1
Description: A local-first WeChat AI assistant with a Go backend, React dashboard,
and a Tauri + NSIS Windows installer.
Signing policy slug: release-signing
```

## 3. 需要三个 Artifact Configuration

因为 Electron/NSIS 是嵌套打包，不能只签最外层 Setup。

### A. `backend-exe`

输入 ZIP 只包含：

```text
SorarinBot.exe
```

签名类型：PE / Authenticode。

### B. `app-exe`

输入 ZIP 是 `electron/release/win-unpacked`，至少签：

```text
SorarinBot.exe
resources/SorarinBot.exe
```

`resources/SorarinBot.exe` 是 Go 后端；如果 A 已经签过，这里重复签也安全。

### C. `installer-exe`

输入 ZIP 包含：

```text
SorarinBot-Setup.exe
SorarinBot-<version>-Setup-payload.exe
```

签名类型：PE / Authenticode。

## 4. 正确的构建顺序

```text
1. 构建 web + Go 后端
2. SignPath 签 backend-exe
3. 用已签名的后端执行 electron-builder --dir
4. 打包 win-unpacked，SignPath 签 app-exe
5. 解压签名结果覆盖 win-unpacked
6. electron-builder --win nsis --prepackaged <signed win-unpacked>
7. SignPath 签 installer-exe（payload）
8. 构建 Tauri Setup，SignPath 签 Setup
9. 重新生成 installer-manifest.json
10. 上传 Setup / payload / manifest
```

第 6 步用 `--prepackaged` 从已签名目录生成 NSIS，避免 inner exe 被重新打包成未签名版本。

## 5. GitHub Actions 调用方式

```yaml
permissions:
  contents: read
  actions: read

steps:
  - name: Upload unsigned backend
    id: upload-backend
    uses: actions/upload-artifact@v4
    with:
      name: unsigned-backend
      path: electron/SorarinBot.exe
      if-no-files-found: error

  - name: Sign backend
    uses: signpath/github-action-submit-signing-request@v3
    with:
      api-token: ${{ secrets.SIGNPATH_API_TOKEN }}
      organization-id: ${{ secrets.SIGNPATH_ORGANIZATION_ID }}
      project-slug: sorarinbot
      signing-policy-slug: release-signing
      artifact-configuration-slug: backend-exe
      github-artifact-id: ${{ steps.upload-backend.outputs.artifact-id }}
      wait-for-completion: true
      output-artifact-directory: signed/backend
```

注意：

- 前置步骤必须是 GitHub-hosted runner
- `actions/upload-artifact` 用 v4+
- SignPath action 用 v3
- 一个请求签一个 Artifact Configuration；三个配置分别提交
- 所有请求完成后再生成 manifest

## 6. 验证

```powershell
pwsh tools/signing/verify-release.ps1 -Path @(
  'artifacts/releases/SorarinBot-Setup.exe',
  'artifacts/releases/SorarinBot-3.0.1-Setup-payload.exe',
  'artifacts/releases/win-unpacked/SorarinBot.exe',
  'artifacts/releases/win-unpacked/resources/SorarinBot.exe'
)
```

全部应为 `Valid`，且带 RFC3161 时间戳。

## 7. 限制

- SignPath Foundation 证书的发布者显示为 **SignPath Foundation**
- 免费签名不等于立刻消除 SmartScreen 信誉；仍需下载量积累
- 如果 SignPath 审核认为 MiSans 字体等第三方资产不符合“全 OSI 组件”，需要把该资产替换为 OFL 字体后再提交
