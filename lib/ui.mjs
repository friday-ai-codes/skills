/**
 * 终端视觉层：ASCII banner、渐变色、统一配色。
 *
 * 渐变用 truecolor（24-bit ANSI）逐行插值，终端不支持彩色或设置了
 * NO_COLOR 时整体降级为纯文本，不影响功能。
 */

import pc from 'picocolors';

const BANNER_LINES = [
  '███████╗██████╗ ██╗██████╗  █████╗ ██╗   ██╗',
  '██╔════╝██╔══██╗██║██╔══██╗██╔══██╗╚██╗ ██╔╝',
  '█████╗  ██████╔╝██║██║  ██║███████║ ╚████╔╝ ',
  '██╔══╝  ██╔══██╗██║██║  ██║██╔══██║  ╚██╔╝  ',
  '██║     ██║  ██║██║██████╔╝██║  ██║   ██║   ',
  '╚═╝     ╚═╝  ╚═╝╚═╝╚═════╝ ╚═╝  ╚═╝   ╚═╝   ',
];

const GRADIENT_FROM = [0, 219, 222]; // 青
const GRADIENT_TO = [252, 70, 107]; // 品红

function supportsColor() {
  if (process.env.NO_COLOR) return false;
  return Boolean(process.stdout.isTTY) || process.env.FORCE_COLOR === '1';
}

function rgbLine(line, [r, g, b]) {
  return `\x1b[38;2;${r};${g};${b}m${line}\x1b[0m`;
}

/** 渐变 ASCII banner（FRIDAY 大字 + SKILLS 副标），返回多行字符串。 */
export function banner(version) {
  const subtitle = 'S K I L L S';
  const tagline = `Friday AI 技能安装器 v${version}`;
  if (!supportsColor()) {
    return ['', ...BANNER_LINES, '', `  ${subtitle}`, `  ${tagline}`, ''].join('\n');
  }
  const colored = BANNER_LINES.map((line, index) => {
    const t = index / (BANNER_LINES.length - 1);
    const rgb = GRADIENT_FROM.map((from, channel) =>
      Math.round(from + (GRADIENT_TO[channel] - from) * t),
    );
    return rgbLine(line, rgb);
  });
  return [
    '',
    ...colored,
    '',
    `  ${pc.bold(pc.magenta(subtitle))}   ${pc.dim(tagline)}`,
    '',
  ].join('\n');
}

export { pc };
