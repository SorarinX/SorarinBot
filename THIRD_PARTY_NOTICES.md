# Third-Party Notices

SorarinBot is distributed under the [PolyForm Noncommercial License 1.0.0](LICENSE).
That license covers the original work in this repository. It does **not** cover the
third-party component listed below, which remains under its own license and is
reproduced here with the notice that license requires.

---

## openwechat

| | |
| --- | --- |
| Upstream | https://github.com/eatmoreapple/openwechat |
| Version | v1.4.10 |
| License | Apache License 2.0 |
| Vendored at | `internal/openwechat/` |
| License copy | [`internal/openwechat/LICENSE`](internal/openwechat/LICENSE) |

SorarinBot embeds a copy of openwechat so the WeChat Web protocol layer can be
built into a single static binary without a separate module dependency. The copy
in `internal/openwechat/` is **not** a dependency resolved through `go.mod`; it is
maintained in-tree.

### Modifications

As required by section 4(b) of the Apache License 2.0, these are the changes made
to the upstream files. **No functional or behavioural change has been made to
openwechat's source code.** Of the 27 Go files in upstream v1.4.10, 20 are
byte-identical to the release.

1. **Test files omitted.** Four upstream test files are not included, because they
   exercise openwechat's own module path and its own dependencies:
   `bot_test.go`, `emoji_test.go`, `errors_test.go`, `message_test.go`.

2. **Four comment lines removed.** Each was a bare hyperlink to an upstream issue
   or pull request, with no accompanying explanation:

   | File | Removed line |
   | --- | --- |
   | `message.go` | `// https://github.com/eatmoreapple/openwechat/issues/66` |
   | `message.go` | `// https://github.com/eatmoreapple/openwechat/issues/113` |
   | `message.go` | `// See https://github.com/eatmoreapple/openwechat/issues/62` |
   | `caller.go` | `// https://github.com/eatmoreapple/openwechat/pull/345` |

   One blank line in `generate.go` was removed as well.

3. **Line endings normalised.** Upstream mixes LF and bare-CR line endings within
   single files; the in-tree copy uses consistent LF.

4. **`go:generate` is not run.** `stringer.go` is committed exactly as upstream
   generated it.

### Why this file exists

The Apache License 2.0 requires that a redistributed copy keep its license text
and carry prominent notices describing any changes. Both requirements were
previously unmet in this repository and are met by this file and by
[`internal/openwechat/LICENSE`](internal/openwechat/LICENSE).

### Compliance notes for redistributors

If you redistribute SorarinBot, or a modified version of it:

- Keep [`internal/openwechat/LICENSE`](internal/openwechat/LICENSE) intact.
- Keep this file, or reproduce its contents somewhere your recipients will find it.
- If you modify `internal/openwechat/`, state that you changed those files. You are
  not required to license your modifications under Apache-2.0, but you must not
  claim the original files as your own.
- Apache-2.0 grants no rights to the "openwechat" name or its contributors' marks.

---

## Other dependencies

Every other third-party component is pulled in through `go.mod` or `package.json`
and is used unmodified. Their licenses are recorded in the module cache and in the
lockfiles. The direct dependencies are:

| Component | License |
| --- | --- |
| [gorilla/websocket](https://github.com/gorilla/websocket) | BSD-3-Clause |
| [sirupsen/logrus](https://github.com/sirupsen/logrus) | MIT |
| [skip2/go-qrcode](https://github.com/skip2/go-qrcode) | MIT |
| [yaml.v3](https://github.com/go-yaml/yaml) | MIT and Apache-2.0 |
| [modernc.org/sqlite](https://gitlab.com/cznic/sqlite) | BSD-3-Clause |
| [energye/systray](https://github.com/energye/systray) | Apache-2.0 |
| [golang.org/x/sys](https://cs.opensource.google/go/x/sys) | BSD-3-Clause |

The web dashboard's JavaScript dependencies are listed in `web/package.json`,
and the desktop shell's in `electron/package.json`.

---

## Trademarks

This project is not affiliated with, endorsed by or connected to Tencent.
"WeChat" and "微信" are trademarks of Tencent Holdings Ltd.
