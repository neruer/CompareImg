# Tauri Windows 本地环境初始化记录

当前目录已经完成以下配置：

- `Node.js` 与 `npm` 可用
- 项目本地 Rust 工具链已安装到 `E:\AIco\newFolder\.cargo-local` 和 `E:\AIco\newFolder\.rustup-local`
- 已安装 `Visual Studio 2022 Build Tools`
- 已安装 `Windows 10 SDK (10.0.19041.0)`
- 已初始化 `Vite + TypeScript + Tauri 2` 项目

## 可直接使用的脚本

查看当前环境版本：

```powershell
powershell -ExecutionPolicy Bypass -File E:\AIco\newFolder\scripts\enter-tauri-dev-shell.ps1
```

启动 Tauri 开发模式：

```bat
E:\AIco\newFolder\scripts\tauri-dev.cmd
```

执行 Tauri 构建：

```bat
E:\AIco\newFolder\scripts\tauri-build.cmd
```

## 当前状态

以下内容已经验证通过：

- 前端 `vite build` 可执行
- Rust/Tauri release 构建可执行
- 可生成应用程序文件：
  - `E:\AIco\newFolder\src-tauri\target\release\aico_desktop.exe`

当前唯一未完成项是安装包打包阶段。

`tauri build` 在最后的 bundle 阶段会去下载 WiX Toolset，用于生成 MSI 安装包；当前这一步仍可能受网络影响失败。

如果你只需要先产出可运行的桌面程序，当前已经具备条件。

## 项目常用命令

```bat
cd /d E:\AIco\newFolder
npm install
scripts\tauri-dev.cmd
scripts\tauri-build.cmd
```
