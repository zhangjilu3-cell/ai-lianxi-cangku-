# Clocktower Zombie Wars · Maria

浏览器俯视角生存射击游戏，使用原生 JavaScript 和 Canvas。

## 启动

安装 Node.js 后在项目目录运行：

```sh
npm run dev
```

打开 http://127.0.0.1:4173/ 。侧面角色检验场：

http://127.0.0.1:4173/?playerModel=upright&modelLab=1&view=side

WASD 移动，鼠标瞄准/射击，1–9 切换武器。

## 当前版本

- 成人角色侧视图，双腿固定，不播放迈步动画。
- 黄色蓄力箭雨，蓄力增加箭数与覆盖范围，不显示梯形边框。
- 喷火、枪口、手臂联动和模型检验场性能改进。
- 自动炮台、坦克和训练木桩。
- 精英怪必掉蓝色护盾拾取物，提供最大生命值 20% 的额外护盾；旧的 Q 主动护盾仍已取消。

## 检查与构建

```sh
npm run lint
npm test
npm run build
```

构建输出在 `dist/`，含静态网站资源和可独立打开的 `standalone.html`。构建产物不提交到 Git。


## Workflow verification

Run `npm run verify` to execute tests, lint and build in order. The runner stops at the first failure and preserves its nonzero exit code; a later successful step cannot hide a failed test.

Review local recursive-improve traces with `python eval/review_wrappers.py --traces-dir eval/traces --output eval/wrapper_review.json`. The JSON and Markdown reports retain outer-wrapper flags and distinguish nested commands, expected polling, identical retry candidates and unknown dynamic arguments. The reviewer does not execute trace code or change input files. Retry candidates require manual interpretation and are not confirmed loops.

Run its tests with `python -m unittest discover -s eval/tests -v`.
