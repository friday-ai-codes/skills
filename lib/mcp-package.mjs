/**
 * Friday MCP npm 包的安装规格（包名@版本）。
 *
 * 版本必须与父仓 `mcp/package.json` 一致：发布门禁 `install_pins` 会校验这一点。
 * skills 内 JS 代码的安装 / 启动命令都从这里拼接，不要在别处再写死包名或版本。
 */
export const MCP_PACKAGE_SPEC = '@friday-ai-codes/mcp@0.7.0';
