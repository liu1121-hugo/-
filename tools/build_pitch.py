#!/usr/bin/env python3
"""Rebuild the 「看见下一步」 roadshow deck on a warm white slide master.

Keeps the 13-slide story, project facts, and section order.
Drops the gray annotation layer (#94A3B8) and lays the same information
out as readable cards, with glasses and personal-memory motifs.
"""

from __future__ import annotations

from lxml import etree
from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE
from pptx.enum.text import MSO_ANCHOR, PP_ALIGN
from pptx.oxml.ns import qn
from pptx.util import Emu, Inches, Pt

# Warm white field. Master background is pure white; warmth comes from
# cream cards, terracotta, and amber — a care product, not a dark console.
WHITE = RGBColor(0xFF, 0xFF, 0xFF)
CREAM = RGBColor(0xFF, 0xF7, 0xF1)
CREAM_DEEP = RGBColor(0xFB, 0xEE, 0xE4)
PEACH = RGBColor(0xFD, 0xE4, 0xD6)
GOLD_BG = RGBColor(0xFB, 0xF3, 0xE0)
SAGE_BG = RGBColor(0xE7, 0xF3, 0xEB)
ROSE_BG = RGBColor(0xFB, 0xEE, 0xEA)
INK = RGBColor(0x3F, 0x2A, 0x24)
BODY = RGBColor(0x5C, 0x40, 0x36)
TERR = RGBColor(0xC4, 0x62, 0x45)
TERR_DEEP = RGBColor(0x8E, 0x3E, 0x2C)
GOLD = RGBColor(0xA8, 0x72, 0x2C)
SAGE = RGBColor(0x2F, 0x6E, 0x52)
LINE = RGBColor(0xF0, 0xDF, 0xD2)
LINE_STRONG = RGBColor(0xE4, 0xCD, 0xB8)

SLIDE_W = 12192000
SLIDE_H = 6858000
FONT = "微软雅黑"


def rgb_hex(color: RGBColor) -> str:
    return f"{color[0]:02X}{color[1]:02X}{color[2]:02X}"


def _fill(shape, color: RGBColor) -> None:
    shape.fill.solid()
    shape.fill.fore_color.rgb = color


def _noline(shape) -> None:
    shape.line.fill.background()


def _line(shape, color: RGBColor, pt: float) -> None:
    shape.line.color.rgb = color
    shape.line.width = Pt(pt)


def _shadow(shape) -> None:
    sp_pr = shape._element.spPr
    for old in sp_pr.findall(qn("a:effectLst")):
        sp_pr.remove(old)
    effect = etree.SubElement(sp_pr, qn("a:effectLst"))
    shadow = etree.SubElement(effect, qn("a:outerShdw"))
    shadow.set("blurRad", "57150")
    shadow.set("dist", "25400")
    shadow.set("dir", "2700000")
    shadow.set("algn", "tl")
    shadow.set("rotWithShape", "0")
    clr = etree.SubElement(shadow, qn("a:srgbClr"))
    clr.set("val", "C4A090")
    alpha = etree.SubElement(clr, qn("a:alpha"))
    alpha.set("val", "30000")


def style_run(run, size: float, bold: bool, color: RGBColor, font: str = FONT) -> None:
    run.font.size = Pt(size)
    run.font.bold = bold
    run.font.color.rgb = color
    run.font.name = font
    r_pr = run._r.get_or_add_rPr()
    for tag in ("a:latin", "a:ea", "a:cs"):
        el = r_pr.find(qn(tag))
        if el is None:
            el = r_pr.makeelement(qn(tag), {})
            r_pr.append(el)
        el.set("typeface", font)


def tb(slide, x, y, w, h, lines, anchor=MSO_ANCHOR.TOP):
    box = slide.shapes.add_textbox(Inches(x), Inches(y), Inches(w), Inches(h))
    tf = box.text_frame
    tf.word_wrap = True
    tf.auto_size = None
    tf.margin_left = Emu(0)
    tf.margin_right = Emu(0)
    tf.margin_top = Emu(0)
    tf.margin_bottom = Emu(0)
    tf.anchor = anchor
    for i, ln in enumerate(lines):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p.alignment = ln.get("align", PP_ALIGN.LEFT)
        p.space_before = Pt(ln.get("sb", 0))
        p.space_after = Pt(ln.get("sa", 0))
        p.line_spacing = ln.get("ls", 1.05)
        run = p.add_run()
        run.text = ln["t"]
        style_run(run, ln.get("sz", 14), ln.get("b", False), ln.get("c", INK))
    return box


def rect(slide, x, y, w, h, fill, line=None, radius=0.12, shadow=False):
    kind = MSO_SHAPE.ROUNDED_RECTANGLE if radius else MSO_SHAPE.RECTANGLE
    sh = slide.shapes.add_shape(kind, Inches(x), Inches(y), Inches(w), Inches(h))
    if radius:
        try:
            sh.adjustments[0] = radius
        except Exception:
            pass
    _fill(sh, fill)
    if line is None:
        _noline(sh)
    else:
        _line(sh, line, 1.0)
    if shadow:
        _shadow(sh)
    return sh


def chip(slide, x, y, w, h, text, fill, fg, size=13):
    rect(slide, x, y, w, h, fill, radius=0.5)
    tb(
        slide,
        x,
        y,
        w,
        h,
        [{"t": text, "sz": size, "b": True, "c": fg, "align": PP_ALIGN.CENTER}],
        anchor=MSO_ANCHOR.MIDDLE,
    )


def add_glasses(slide, x, y, w, h, color, sw=1.75, lens=None):
    """Line-drawn glasses inside an inch box. Product mark, not a photo."""
    lens_w = w * 0.34
    lens_h = h * 0.68
    gap = w * 0.10
    top = y + h * 0.16
    x1 = x + w * 0.12
    x2 = x1 + lens_w + gap
    for lx in (x1, x2):
        sh = slide.shapes.add_shape(
            MSO_SHAPE.OVAL, Inches(lx), Inches(top), Inches(lens_w), Inches(lens_h)
        )
        if lens is None:
            sh.fill.background()
        else:
            _fill(sh, lens)
        _line(sh, color, sw)
    bridge_y = top + lens_h * 0.42
    bridge_h = max(h * 0.07, 0.028)
    br = slide.shapes.add_shape(
        MSO_SHAPE.RECTANGLE,
        Inches(x1 + lens_w - 0.008),
        Inches(bridge_y),
        Inches(gap + 0.016),
        Inches(bridge_h),
    )
    _fill(br, color)
    _noline(br)
    arm_h = max(sw / 72.0, 0.02)
    arm_y = top + lens_h * 0.38
    for ax, aw in ((x, w * 0.13), (x2 + lens_w - 0.01, w * 0.13)):
        arm = slide.shapes.add_shape(
            MSO_SHAPE.RECTANGLE, Inches(ax), Inches(arm_y), Inches(aw), Inches(arm_h)
        )
        _fill(arm, color)
        _noline(arm)


def page_no(slide, n, total=13):
    tb(
        slide,
        11.15,
        7.16,
        1.65,
        0.26,
        [{"t": f"{n:02d}   /   {total:02d}", "sz": 12, "b": True, "c": TERR, "align": PP_ALIGN.RIGHT}],
    )


def header(slide, kicker, title, page):
    add_glasses(slide, 0.50, 0.26, 0.58, 0.32, TERR, 1.6, WHITE)
    tb(slide, 1.20, 0.26, 8.6, 0.30, [{"t": kicker, "sz": 13, "b": True, "c": TERR}])
    tb(slide, 0.50, 0.62, 12.3, 0.52, [{"t": title, "sz": 26, "b": True, "c": INK}])
    page_no(slide, page)


def marker(slide, x, y, color):
    sh = slide.shapes.add_shape(
        MSO_SHAPE.OVAL, Inches(x), Inches(y), Inches(0.12), Inches(0.12)
    )
    _fill(sh, color)
    _noline(sh)


def set_master_and_theme(prs: Presentation) -> None:
    master = prs.slide_masters[0]
    bg = master.background
    bg.fill.solid()
    bg.fill.fore_color.rgb = WHITE

    # Warm hairline lives on the master, so every layout inherits it.
    # MasterShapes has no add_shape; write the shape into the master tree.
    bar = etree.fromstring(
        """
        <p:sp xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
              xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
          <p:nvSpPr>
            <p:cNvPr id="90" name="WarmBar"/>
            <p:cNvSpPr/>
            <p:nvPr/>
          </p:nvSpPr>
          <p:spPr>
            <a:xfrm>
              <a:off x="0" y="0"/>
              <a:ext cx="12192000" cy="54864"/>
            </a:xfrm>
            <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
            <a:solidFill><a:srgbClr val="C46245"/></a:solidFill>
            <a:ln><a:noFill/></a:ln>
          </p:spPr>
        </p:sp>
        """
    )
    master.shapes._spTree.append(bar)

    theme_part = None
    for rel in master.part.rels.values():
        if rel.reltype.endswith("/theme"):
            theme_part = rel.target_part
            break
    if theme_part is None:
        return
    root = etree.fromstring(theme_part.blob)
    ns = {"a": "http://schemas.openxmlformats.org/drawingml/2006/main"}
    scheme = root.find(".//a:clrScheme", ns)
    mapping = {
        "dk1": "3F2A24",
        "lt1": "FFFFFF",
        "dk2": "5C4036",
        "lt2": "FFF7F1",
        "accent1": "C46245",
        "accent2": "A8722C",
        "accent3": "2F6E52",
        "accent4": "8E3E2C",
        "accent5": "E09A78",
        "accent6": "F3D6C4",
        "hlink": "8E3E2C",
        "folHlink": "2F6E52",
    }
    for name, hexv in mapping.items():
        node = scheme.find(f"a:{name}", ns)
        if node is None:
            continue
        for child in list(node):
            node.remove(child)
        srgb = etree.SubElement(node, qn("a:srgbClr"))
        srgb.set("val", hexv)
    if root.tag == qn("a:theme"):
        root.set("name", "看见下一步 暖白")
    theme_part._blob = etree.tostring(root, xml_declaration=True, encoding="UTF-8", standalone=True)


def blank_layout(prs):
    for layout in prs.slide_layouts:
        if layout.name.lower() == "blank":
            return layout
    return prs.slide_layouts[6]


def cell_text(cell, lines, size, bold, color, fill, align=PP_ALIGN.CENTER):
    cell.fill.solid()
    cell.fill.fore_color.rgb = fill
    cell.vertical_anchor = MSO_ANCHOR.MIDDLE
    cell.margin_left = Inches(0.06)
    cell.margin_right = Inches(0.06)
    cell.margin_top = Inches(0.04)
    cell.margin_bottom = Inches(0.04)
    tf = cell.text_frame
    tf.word_wrap = True
    for i, text in enumerate(lines):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p.alignment = align
        p.line_spacing = 1.0
        if p.runs:
            run = p.runs[0]
            run.text = text
        else:
            run = p.add_run()
            run.text = text
        style_run(run, size, bold, color)
    tc = cell._tc
    tc_pr = tc.get_or_add_tcPr()
    for edge in ("lnL", "lnR", "lnT", "lnB"):
        for old in tc_pr.findall(qn(f"a:{edge}")):
            tc_pr.remove(old)
        ln = etree.SubElement(tc_pr, qn(f"a:{edge}"))
        ln.set("w", "6350")
        solid = etree.SubElement(ln, qn("a:solidFill"))
        srgb = etree.SubElement(solid, qn("a:srgbClr"))
        srgb.set("val", "E4CDB8")


# ---------------------------------------------------------------------------
# Slides
# ---------------------------------------------------------------------------

def slide_cover(slide):
    tb(slide, 0.58, 0.42, 7.4, 0.32, [{"t": "视障人士的保障产品", "sz": 15, "b": True, "c": TERR}])
    tb(slide, 0.55, 0.82, 7.6, 0.78, [{"t": "「看见下一步」", "sz": 44, "b": True, "c": INK}])
    tb(
        slide,
        0.58,
        1.68,
        7.5,
        0.7,
        [{"t": "面向视障人群的双 Agent 随身智能眼镜", "sz": 22, "b": True, "c": INK}],
    )
    tb(
        slide,
        0.58,
        2.42,
        7.4,
        0.55,
        [
            {
                "t": "双 Agent 精准分流  ·  24 小时个性化记忆  ·  挂脖分体续航  ·  自研置信决策",
                "sz": 14,
                "b": True,
                "c": GOLD,
            }
        ],
    )
    rect(slide, 0.58, 3.15, 7.35, 1.28, CREAM, LINE, 0.1, shadow=True)
    rect(slide, 0.58, 3.15, 0.08, 1.28, TERR, radius=0)
    tb(
        slide,
        0.88,
        3.32,
        6.85,
        0.95,
        [
            {
                "t": "不做会看图的聊天套壳。只做盲人在货架前、出门时，自己就能听懂并执行的下一步。",
                "sz": 16,
                "c": INK,
                "ls": 1.15,
            }
        ],
    )

    rect(slide, 8.15, 0.42, 4.62, 4.02, CREAM, LINE, 0.1, shadow=True)
    add_glasses(slide, 8.55, 0.62, 3.82, 1.55, TERR, 2.5, WHITE)
    tb(
        slide,
        8.35,
        2.22,
        4.22,
        0.32,
        [{"t": "48g  眼位同轴镜架", "sz": 15, "b": True, "c": INK, "align": PP_ALIGN.CENTER}],
    )
    # stems
    for sx in (9.35, 11.15):
        stem = slide.shapes.add_shape(
            MSO_SHAPE.RECTANGLE, Inches(sx), Inches(2.55), Inches(0.035), Inches(0.42)
        )
        _fill(stem, TERR)
        _noline(stem)
    rect(slide, 8.85, 2.95, 3.22, 0.62, TERR, radius=0.4)
    tb(
        slide,
        8.85,
        2.95,
        3.22,
        0.62,
        [{"t": "挂脖电池环   2500mAh", "sz": 14, "b": True, "c": WHITE, "align": PP_ALIGN.CENTER}],
        anchor=MSO_ANCHOR.MIDDLE,
    )
    tb(
        slide,
        8.4,
        3.68,
        4.15,
        0.62,
        [
            {"t": "相机留在眼前，重量留给后颈。", "sz": 13, "c": BODY, "align": PP_ALIGN.CENTER},
            {"t": "视线朝哪，指引就朝哪。", "sz": 13, "c": BODY, "align": PP_ALIGN.CENTER, "sb": 2},
        ],
    )

    cards = [
        ("硬件架构", "挂脖环 + 48g 镜架"),
        ("核心认知", "视觉 Agent + 闲聊 Agent"),
        ("记忆系统", "24h 自衰减的个人偏好"),
        ("商业定位", "平价普及，不做万元机"),
    ]
    gap = 0.16
    cw = (12.22 - 3 * gap) / 4
    for i, (title, body) in enumerate(cards):
        x = 0.55 + i * (cw + gap)
        rect(slide, x, 5.22, cw, 1.7, WHITE, LINE, 0.1, shadow=True)
        add_glasses(slide, x + 0.18, 5.36, 0.62, 0.32, TERR, 1.35, CREAM)
        tb(slide, x + 0.18, 5.78, cw - 0.36, 0.32, [{"t": title, "sz": 13, "b": True, "c": TERR}])
        tb(slide, x + 0.18, 6.12, cw - 0.36, 0.62, [{"t": body, "sz": 15, "b": True, "c": INK, "ls": 1.05}])
    page_no(slide, 1)


def slide_pain(slide):
    header(slide, "ORIGIN  &  USER EMPATHY", "真实痛点：为什么会看图的大模型，给不了盲人一瓶可乐？", 2)
    chip(slide, 9.15, 0.24, 3.62, 0.36, "起点 · 盲人博主的超市求助", PEACH, TERR_DEEP, 12)

    cols = [
        (
            ROSE_BG,
            TERR,
            "传统通用大模型的「店面失败」",
            [
                ("只会宏观描述", "货架拍给豆包，只换来「整齐、明亮、饮料很多」，没有下一步。"),
                ("无法支持行动", "要的是手往哪伸、第几排、先停还是往前，不是一段风景描写。"),
                ("伪精确幻觉", "编造「前方 37 厘米 / 走 2 步」。单目测不准，伸手容易撞倒货架。"),
                ("不敢开口求助", "求助几次受阻就不敢出门。需要一副能自己依靠的随身眼。"),
            ],
        ),
        (
            GOLD_BG,
            GOLD,
            "现有专用助盲硬件的「三座大山」",
            [
                ("价格高到用不起", "Envision Glasses $2499–$3499（约 1.8–2.5 万元），OrCam 超过 3 万元。"),
                ("压鼻，或出不了门", "大电池把鼻梁压到 80g 以上；200mAh 轻镜连续推理大约只撑 1 小时。"),
                ("胸口镜头是错的", "Humane Pin 一类胸挂：脸转向货架，镜头仍对着胸口，左右全部报反。"),
                ("平民的拆法", "相机留在眼位，电池挂在脖子，算法在网关，行动落在边缘。"),
            ],
        ),
    ]
    for i, (bg, accent, title, items) in enumerate(cols):
        x = 0.48 + i * 6.42
        rect(slide, x, 1.38, 6.22, 5.58, bg, LINE, 0.08, shadow=True)
        rect(slide, x, 1.38, 6.22, 0.1, accent, radius=0)
        tb(slide, x + 0.28, 1.62, 5.7, 0.48, [{"t": title, "sz": 18, "b": True, "c": accent}])
        yy = 2.22
        for name, desc in items:
            marker(slide, x + 0.32, yy + 0.08, accent)
            tb(slide, x + 0.56, yy, 5.35, 0.32, [{"t": name, "sz": 15, "b": True, "c": INK}])
            tb(slide, x + 0.56, yy + 0.34, 5.35, 0.7, [{"t": desc, "sz": 14, "c": BODY, "ls": 1.05}])
            yy += 1.12


def slide_hardware(slide):
    header(slide, "HARDWARE ENGINEERING", "硬件形态：挂脖电池环 + 48g 超轻同轴眼镜", 3)
    rect(slide, 0.48, 1.36, 12.36, 1.62, CREAM, LINE, 0.08, shadow=True)
    add_glasses(slide, 0.7, 1.52, 2.15, 0.85, TERR, 2.0, WHITE)
    tb(slide, 0.7, 2.4, 2.2, 0.42, [{"t": "48g 眼位相机", "sz": 14, "b": True, "c": INK, "align": PP_ALIGN.CENTER}])
    bar = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(3.05), Inches(2.05), Inches(1.15), Inches(0.035))
    _fill(bar, TERR)
    _noline(bar)
    rect(slide, 4.35, 1.72, 3.5, 0.78, TERR, radius=0.45)
    tb(
        slide,
        4.35,
        1.72,
        3.5,
        0.78,
        [
            {"t": "挂脖电池环", "sz": 16, "b": True, "c": WHITE, "align": PP_ALIGN.CENTER},
            {"t": "2500–3000mAh  ·  6–10 小时", "sz": 13, "b": True, "c": WHITE, "align": PP_ALIGN.CENTER, "sb": 2},
        ],
        anchor=MSO_ANCHOR.MIDDLE,
    )
    bar2 = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(8.05), Inches(2.05), Inches(1.05), Inches(0.035))
    _fill(bar2, GOLD)
    _noline(bar2)
    rect(slide, 9.25, 1.68, 3.25, 0.95, GOLD_BG, LINE, 0.12)
    tb(
        slide,
        9.4,
        1.78,
        2.95,
        0.75,
        [
            {"t": "磁吸快拆  2.5–4N", "sz": 15, "b": True, "c": GOLD},
            {"t": "刮蹭即脱开，防勒防摔", "sz": 13, "c": BODY, "sb": 2},
        ],
    )

    columns = [
        (
            "01",
            "脸上鼻梁只留 48g",
            "眼位同轴相机 + IMU",
            [
                "工作重量 42–55g，停在舒适红线里",
                "相机在鼻梁正中，光轴永远跟着脸",
                "避开胸挂「头转了，镜头没转」",
                "左镜腿大按键，摸到就能长按说话",
            ],
        ),
        (
            "02",
            "后颈承重 2500mAh",
            "挂脖电池舱 + 硅胶软管",
            [
                "90–130g 落在锁骨后颈，像挂脖耳机",
                "2500–3000mAh，支持 6–10 小时巡视",
                "不再拖一条会被手杖扫飞的长线",
                "喇叭口盲插 USB-C，凸点摸得出电量",
            ],
        ),
        (
            "03",
            "磁吸快拆，防勒防摔",
            "2.5–4N 临界脱开力",
            [
                "镜腿与软管：子弹头镀金 Pogopin",
                "悬得住 55g，刮蹭时自己脱开",
                "镜内微电芯，脱开就说「线掉了」",
                "摘下垂在胸前，伸手能摸到",
            ],
        ),
    ]
    for i, (num, title, sub, items) in enumerate(columns):
        x = 0.48 + i * 4.16
        rect(slide, x, 3.16, 4.0, 3.82, WHITE, LINE, 0.08, shadow=True)
        tb(slide, x + 0.22, 3.3, 1.1, 0.36, [{"t": num, "sz": 18, "b": True, "c": TERR}])
        tb(slide, x + 0.22, 3.68, 3.55, 0.36, [{"t": title, "sz": 16, "b": True, "c": INK}])
        tb(slide, x + 0.22, 4.06, 3.55, 0.3, [{"t": sub, "sz": 13, "b": True, "c": GOLD}])
        yy = 4.48
        for item in items:
            marker(slide, x + 0.26, yy + 0.06, TERR)
            tb(slide, x + 0.48, yy, 3.3, 0.52, [{"t": item, "sz": 13, "c": BODY}])
            yy += 0.56


def slide_states(slide):
    header(slide, "HUMAN-FACTOR  &  STATE ENGINE", "人因设计：懂得分寸的「三态」智能感知", 4)
    states = [
        (
            SAGE,
            SAGE_BG,
            "状态 1",
            "戴着看",
            "工作巡视",
            "镜架保持水平（仰俯 ±25° 以内），每 2.5 秒抽一帧高质量画面送进网关。",
            "手杖负责探路，眼镜负责指路。台阶、障碍、目标物，用声音马上说出来。",
        ),
        (
            GOLD,
            GOLD_BG,
            "状态 2",
            "挂在胸前",
            "停车休眠",
            "随手摘下、仰角大于 50° 并持续 1.5 秒，就停止推理和播报，不对着衣服乱说。",
            "重新戴上 0.8 秒唤醒，耳边轻声提示「开始看」。隐私和听觉都留得住。",
        ),
        (
            TERR,
            ROSE_BG,
            "状态 3",
            "磁吸脱开",
            "防摔保护",
            "大约 3N 的拉力下平顺断开。软管和领夹兜住，镜架不会砸到地上。",
            "镜内 150mAh 应急电芯高优先级播报「线掉了」。顺着软管，大约 2 秒盲操吸回。",
        ),
    ]
    for i, (accent, bg, idx, name, tag, a, b) in enumerate(states):
        y = 1.38 + i * 1.88
        rect(slide, 0.48, y, 12.36, 1.76, bg, LINE, 0.08, shadow=True)
        rect(slide, 0.48, y, 0.1, 1.76, accent, radius=0)
        add_glasses(slide, 0.78, y + 0.28, 1.15, 0.58, accent, 1.75, WHITE)
        tb(slide, 0.72, y + 1.0, 1.35, 0.28, [{"t": idx, "sz": 12, "b": True, "c": accent, "align": PP_ALIGN.CENTER}])
        tb(slide, 2.15, y + 0.22, 4.2, 0.42, [{"t": name, "sz": 22, "b": True, "c": INK}])
        chip(slide, 6.3, y + 0.28, 1.7, 0.36, tag, WHITE, accent, 13)
        tb(slide, 2.15, y + 0.78, 10.3, 0.4, [{"t": a, "sz": 15, "c": INK}])
        tb(slide, 2.15, y + 1.2, 10.3, 0.4, [{"t": b, "sz": 15, "c": BODY}])


def slide_agents(slide):
    header(slide, "SOFTWARE ARCHITECTURE", "双 Agent 分工：视觉任务，和闲聊陪伴，各走各的", 5)
    agents = [
        (
            PEACH,
            TERR,
            "Agent A",
            "视觉任务",
            "看路、找物、读价",
            [
                "职责：看图指路、货架排位、微观避障、读价格价签",
                "输入：眼位最新 JPEG 关键帧，加上 30 分钟主任务",
                "基座：MiMo-v2.5 / Qwen-VL，抽出二维空间网格",
                "输出：方向、距离带、障碍、风险，和一句能执行的话",
                "闭环：keep / refine / switch / done，找到就清空，回到巡视",
            ],
        ),
        (
            SAGE_BG,
            SAGE,
            "Agent B",
            "闲聊陪伴",
            "问候、天气、新闻",
            [
                "职责：日常问好、情绪安抚、即时天气、新闻",
                "隔离：零照片进入，纯文本，不占用视觉算力",
                "安全：闲聊不改写、也不冲掉正在进行的「找可乐」",
                "联网：天气和新闻走轻量检索，不背模型里的旧闻",
                "听觉：去掉链接和套话，压进 72 个字，读得完",
            ],
        ),
    ]
    for i, (bg, accent, code, name, tag, items) in enumerate(agents):
        x = 0.48 + i * 6.42
        rect(slide, x, 1.36, 6.22, 4.72, WHITE, LINE, 0.08, shadow=True)
        rect(slide, x + 0.16, 1.52, 5.90, 0.84, bg, radius=0.16)
        add_glasses(slide, x + 0.32, 1.66, 0.72, 0.46, accent, 1.55, WHITE)
        tb(slide, x + 1.18, 1.6, 4.6, 0.34, [{"t": f"{code}   {name}", "sz": 18, "b": True, "c": accent}])
        tb(slide, x + 1.18, 1.96, 4.6, 0.28, [{"t": tag, "sz": 13, "b": True, "c": BODY}])
        yy = 2.54
        for item in items:
            marker(slide, x + 0.28, yy + 0.06, accent)
            tb(slide, x + 0.52, yy, 5.45, 0.62, [{"t": item, "sz": 14, "c": INK, "ls": 1.02}])
            yy += 0.68

    rect(slide, 0.48, 6.22, 12.36, 0.78, CREAM, LINE, 0.1)
    add_glasses(slide, 0.68, 6.36, 0.7, 0.42, TERR, 1.5, WHITE)
    tb(
        slide,
        1.55,
        6.32,
        10.9,
        0.58,
        [
            {
                "t": "同一套网关做分流：照片只进视觉 Agent。闲聊不碰主任务。松开按键，马上按该做的那一件去执行。",
                "sz": 15,
                "b": True,
                "c": INK,
            }
        ],
        anchor=MSO_ANCHOR.MIDDLE,
    )


def slide_intent(slide):
    header(slide, "INTENT DISPATCHER  &  STATE MACHINE", "毫秒级意图优先级，和任务状态机", 6)
    rect(slide, 0.48, 1.36, 7.35, 5.62, WHITE, LINE, 0.08, shadow=True)
    tb(slide, 0.72, 1.5, 6.9, 0.36, [{"t": "先判哪一件事", "sz": 18, "b": True, "c": INK}])
    tb(slide, 0.72, 1.9, 6.9, 0.32, [{"t": "6 秒内只做纯文本判定，松手后立刻拍照执行", "sz": 13, "b": True, "c": GOLD}])
    priorities = [
        ("1", "收银结账", "find_cashier", "权重最高。结账、买单、收银台。免得「我要结账」被听成找商品。"),
        ("2", "寻找出入口", "find_entrance", "大门、入口、出门。先保证人走得出去。"),
        ("3", "读取价格", "read_price", "多少钱、看价签。只认数字和货币，不许脑补。"),
        ("4", "避障防跌", "avoid_obstacle", "能不能走、有没有台阶。安全提醒压过别的话。"),
        ("5", "寻找商品", "find_product", "找可乐、拿矿泉水。落到二维网格上。"),
    ]
    yy = 2.34
    for num, name, code, desc in priorities:
        rect(slide, 0.72, yy, 0.42, 0.42, PEACH, radius=0.3)
        tb(
            slide,
            0.72,
            yy,
            0.42,
            0.42,
            [{"t": num, "sz": 14, "b": True, "c": TERR, "align": PP_ALIGN.CENTER}],
            anchor=MSO_ANCHOR.MIDDLE,
        )
        tb(slide, 1.28, yy - 0.02, 6.2, 0.28, [{"t": f"{name}    {code}", "sz": 14, "b": True, "c": INK}])
        tb(slide, 1.28, yy + 0.28, 6.25, 0.48, [{"t": desc, "sz": 13, "c": BODY}])
        yy += 0.88

    rect(slide, 8.02, 1.36, 4.82, 4.28, CREAM, LINE, 0.08, shadow=True)
    tb(slide, 8.24, 1.5, 4.4, 0.34, [{"t": "一次寻找的五种状态", "sz": 16, "b": True, "c": INK}])
    states = [
        ("NEW", "新建", "新目标出现，记下这次主任务"),
        ("KEEP", "锁定", "没听到新指令，就继续找原来的"),
        ("REFINE", "收窄", "同一件东西上补充，比如「无糖的」"),
        ("SWITCH", "切换", "改找收银台，旧任务马上放开"),
        ("DONE", "完成", "手能够到，而且置信度够，就结束"),
    ]
    yy = 1.98
    for code, name, desc in states:
        tb(slide, 8.24, yy, 1.35, 0.32, [{"t": code, "sz": 13, "b": True, "c": TERR}])
        tb(slide, 9.55, yy, 1.1, 0.32, [{"t": name, "sz": 14, "b": True, "c": INK}])
        tb(slide, 8.24, yy + 0.28, 4.35, 0.3, [{"t": desc, "sz": 13, "c": BODY}])
        yy += 0.68

    rect(slide, 8.02, 5.78, 4.82, 1.2, PEACH, radius=0.1)
    tb(slide, 8.22, 5.9, 4.45, 0.28, [{"t": "个性化就长在 REFINE 里", "sz": 13, "b": True, "c": TERR_DEEP}])
    tb(
        slide,
        8.22,
        6.22,
        4.45,
        0.62,
        [
            {"t": "「无糖的」「再往左」不新开任务，", "sz": 13, "c": INK},
            {"t": "只把正在找的那一件收窄。", "sz": 13, "c": INK, "sb": 1},
        ],
    )


def slide_weights(slide):
    header(slide, "PROPRIETARY WEIGHT ALGORITHM", "自研权重：纠错优先，高频慢慢加重，过一天就忘掉", 7)
    rect(slide, 0.48, 1.36, 7.55, 5.62, WHITE, LINE, 0.08, shadow=True)
    tb(slide, 0.72, 1.52, 7.1, 0.34, [{"t": "一条记忆值多少分", "sz": 18, "b": True, "c": INK}])
    rect(slide, 0.72, 2.0, 7.05, 0.95, GOLD_BG, radius=0.08)
    tb(
        slide,
        0.9,
        2.1,
        6.7,
        0.75,
        [
            {"t": "Score  =  BaseWeight  +  min(Uses, 5) × 0.15", "sz": 16, "b": True, "c": GOLD},
            {"t": "排序  RankKey  =  (Score,  Updated_At)", "sz": 14, "b": True, "c": SAGE, "sb": 4},
        ],
    )
    rules = [
        ("纠错  ·  权重 3", "听到「不是这个 / 偏左了」，马上盖过旧判断。"),
        ("显式偏好  ·  权重 3", "「记住我喝无糖乌龙茶」，和纠错同一级，优先锁定。"),
        ("高频寻找  ·  权重 2", "常买的东西每次再用 +0.15，慢慢长出来。"),
        ("次数有顶", "min(Uses, 5)，加分最多 0.75。旧习惯压不住刚说的话。"),
        ("满一天就清除", "分数相同，以最近一次为准。超过 24 小时，物理删掉。"),
    ]
    yy = 3.12
    for title, desc in rules:
        marker(slide, 0.78, yy + 0.06, TERR)
        tb(slide, 1.04, yy, 6.7, 0.26, [{"t": title, "sz": 14, "b": True, "c": INK}])
        tb(slide, 1.04, yy + 0.28, 6.7, 0.32, [{"t": desc, "sz": 13, "c": BODY}])
        yy += 0.72

    rect(slide, 8.22, 1.36, 4.62, 3.64, CREAM, LINE, 0.08, shadow=True)
    tb(slide, 8.44, 1.5, 4.2, 0.34, [{"t": "什么时候再问一次", "sz": 16, "b": True, "c": INK}])
    checks = [
        ("低置信才复核", "平时一个模型就够。", "low、未确定或高风险，才请第二个。"),
        ("风险只升不降", "Risk = max(两个模型)。", "有一个说危险，就按危险处理。"),
        ("左右冲突不折中", "方向相反时，不取平均。", "置信度降为 low，改报「未确定」。"),
        ("稳了就省一半", "连续高置信，方向也一致，", "就跳过第二阶段，少一半调用。"),
    ]
    yy = 1.96
    for title, line_a, line_b in checks:
        tb(slide, 8.44, yy, 4.2, 0.24, [{"t": title, "sz": 14, "b": True, "c": TERR}])
        tb(
            slide,
            8.44,
            yy + 0.26,
            4.2,
            0.48,
            [
                {"t": line_a, "sz": 13, "c": BODY},
                {"t": line_b, "sz": 13, "c": BODY, "sb": 1},
            ],
        )
        yy += 0.74

    rect(slide, 8.22, 5.12, 4.62, 1.86, PEACH, radius=0.1)
    add_glasses(slide, 8.42, 5.22, 0.78, 0.42, TERR_DEEP, 1.5, WHITE)
    tb(slide, 9.3, 5.24, 3.3, 0.36, [{"t": "这个人今天的偏好", "sz": 14, "b": True, "c": TERR_DEEP}])
    chip(slide, 8.42, 5.82, 1.9, 0.36, "无糖乌龙茶", WHITE, TERR_DEEP, 12)
    chip(slide, 10.44, 5.82, 1.15, 0.36, "权重 3", TERR, WHITE, 12)
    chip(slide, 8.42, 6.3, 1.35, 0.36, "纠错优先", WHITE, TERR_DEEP, 12)
    chip(slide, 9.88, 6.3, 1.7, 0.36, "24h 后自毁", WHITE, TERR_DEEP, 12)


def slide_memory(slide):
    header(slide, "24-HOUR MEMORY ARCHITECTURE", "24 小时自愈记忆：懂你，但不过夜还留着", 8)
    cols = [
        (
            WHITE,
            TERR,
            "这一次出门",
            "30 分钟  ·  task_memory.sqlite",
            [
                "从货架、第几层、手的位置，记到收银为止。",
                "每一帧都带上主任务，避免看一张、忘一句。",
                "找到了，或你说换目标，旧的马上放开。",
            ],
        ),
        (
            PEACH,
            TERR_DEEP,
            "今天记住的事",
            "24 小时  ·  最多 20 条  ·  highlights.sqlite",
            [
                "只收你明确要记的习惯、常找的东西、现场纠错。",
                "问「我让你记了什么」，只查这 24 小时，不调画面。",
                "超时物理抹掉，不把生活偏好长期放上公有云。",
            ],
        ),
        (
            SAGE_BG,
            SAGE,
            "三条铁律",
            "不留下视觉记忆",
            [
                "不存照片：推理结束，图从磁盘和内存删除。",
                "密钥不出手机：供应商私钥只放在云端网关。",
                "端上不留长记录：小程序和眼镜，扫码即用。",
            ],
        ),
    ]
    for i, (bg, accent, title, sub, items) in enumerate(cols):
        x = 0.48 + i * 4.16
        rect(slide, x, 1.36, 4.0, 4.15, bg, LINE, 0.08, shadow=True)
        tb(slide, x + 0.22, 1.52, 3.55, 0.4, [{"t": title, "sz": 18, "b": True, "c": accent}])
        tb(slide, x + 0.22, 2.0, 3.55, 0.55, [{"t": sub, "sz": 13, "b": True, "c": INK, "ls": 1.05}])
        yy = 2.7
        for item in items:
            marker(slide, x + 0.26, yy + 0.06, accent)
            tb(slide, x + 0.48, yy, 3.28, 0.75, [{"t": item, "sz": 14, "c": BODY, "ls": 1.05}])
            yy += 0.85

    rect(slide, 0.48, 5.68, 12.36, 1.3, CREAM, LINE, 0.08)
    tb(slide, 0.72, 5.82, 3.2, 0.32, [{"t": "会随这个人变化的标签", "sz": 14, "b": True, "c": TERR}])
    x = 3.95
    for width, text in (
        (1.25, "脱脂奶"),
        (1.8, "无糖乌龙茶"),
        (1.25, "偏左了"),
        (1.95, "常去的便利店"),
        (1.5, "24h 清除"),
    ):
        chip(slide, x, 5.8, width, 0.38, text, WHITE, TERR_DEEP, 13)
        x += width + 0.14
    tb(
        slide,
        0.72,
        6.32,
        11.8,
        0.48,
        [{"t": "标签来自本人当时的话，不是一份写死的用户画像。纠错可以盖过它，一天之后它自己消失。", "sz": 14, "c": BODY}],
    )


def slide_space(slide):
    header(slide, "BODY-FRAME SPATIAL LANGUAGE", "身体参照系：5 向  ×  3 层  ×  4 带", 9)
    cols = [
        (
            "五向",
            "以脸的朝向为原点",
            ["左侧", "左前方", "正前方", "右前方", "右侧"],
            "左右说反了，就不取中间值，改报「未确定」，先停下。",
        ),
        (
            "三层",
            "以身体高度来数",
            ["手高这层", "再高一层", "再矮一层"],
            "从左手边数，最多报到第 6 个。台面不报个数，改说靠近你，或靠里。",
        ),
        (
            "四带",
            "看画面占比，可选 ToF",
            ["一臂内  < 0.8m", "较近  0.8–2m", "较远  > 2m", "看不清  不猜测"],
            "一臂内提醒慢一点探。看不清，就禁止编一个距离。",
        ),
        (
            "安全清洗",
            "网关里用规则拦住",
            ["去掉米和厘米", "去掉步数、角度", "去掉「直接前进」", "危险句以「注意」起"],
            "看不清，就清楚地说「看不清，请先停下」。",
        ),
    ]
    for i, (title, sub, pills, note) in enumerate(cols):
        x = 0.42 + i * 3.22
        rect(slide, x, 1.36, 3.08, 4.55, WHITE, LINE, 0.08, shadow=True)
        if i == 0:
            add_glasses(slide, x + 1.95, 1.5, 0.9, 0.46, TERR, 1.45, CREAM)
        tb(slide, x + 0.18, 1.5, 2.5, 0.4, [{"t": title, "sz": 20, "b": True, "c": TERR}])
        tb(slide, x + 0.18, 1.98, 2.72, 0.4, [{"t": sub, "sz": 13, "b": True, "c": GOLD}])
        yy = 2.5
        for pill in pills:
            chip(slide, x + 0.18, yy, 2.72, 0.36, pill, CREAM, INK, 13)
            yy += 0.44
        tb(slide, x + 0.18, 4.85, 2.72, 0.9, [{"t": note, "sz": 13, "c": BODY, "ls": 1.05}])

    rect(slide, 0.42, 6.08, 12.5, 0.9, PEACH, radius=0.1)
    add_glasses(slide, 0.62, 6.28, 0.78, 0.46, TERR_DEEP, 1.5, WHITE)
    tb(slide, 1.6, 6.18, 10.9, 0.28, [{"t": "会说给这个人听的一句", "sz": 13, "b": True, "c": TERR_DEEP}])
    tb(
        slide,
        1.6,
        6.48,
        10.9,
        0.38,
        [{"t": "「在你左前方，手高这层，一臂内。注意，先停下。」  ——  不报毫米，不报步数。", "sz": 16, "b": True, "c": INK}],
    )


def slide_market(slide):
    header(slide, "COMPETITIVE LANDSCAPE", "市场对照：把助盲行动终端做到百元级", 10)
    rows = [
        ["产品", "售价", "重量 / 续航", "光轴", "指令", "记忆与分工", "安全降级"],
        ["万元助盲机\nEnvision / OrCam", "1.8万–3万元\n极度昂贵", "46–70g\n续航 1–2 小时", "眼位相机\n部分要夹持", "读字、认脸\n少有下一步", "无双 Agent\n规则封闭", "高风险没有\n第二阶段复核"],
        ["消费级眼镜\nRay-Ban Meta / Rokid", "1800–3000 元\n硬件平价", "50g 级\n录像约 1 小时", "眼位镜架\n外观优先", "通用拍照\n不会货架寻物", "单对话流\n闲聊和任务混着", "没有避障约束\n会产生幻觉"],
        ["通用大模型\n豆包 / GPT-4o", "软件免费或订阅\n必须手持手机", "手机 200g+\n手被占满", "手持对准\n很难瞄稳", "文学性描写\n「有货架和灯」", "单 Agent\n没有身体记忆", "盲目自信\n编造厘米和步数"],
        ["看见下一步\n双 Agent 眼镜", "百元级打样\n加普惠订阅", "鼻梁 48g\n挂脖 6–10 小时", "眼位同轴\n看哪指哪", "5×3×4\n能执行的身体动作", "双 Agent 分流\n24h 权重记忆", "自研权重\n冲突则未确定"],
    ]
    table_shape = slide.shapes.add_table(5, 7, Inches(0.4), Inches(1.4), Inches(12.52), Inches(5.15))
    table = table_shape.table
    widths = [1.95, 1.7, 1.7, 1.55, 1.7, 1.95, 1.97]
    for i, w in enumerate(widths):
        table.columns[i].width = Inches(w)
    table.rows[0].height = Inches(0.55)
    for r in range(1, 5):
        table.rows[r].height = Inches(1.15)
    for r, row in enumerate(rows):
        for c, text in enumerate(row):
            lines = text.split("\n")
            if r == 0:
                cell_text(table.cell(r, c), lines, 12, True, WHITE, TERR)
            elif r == 4:
                cell_text(table.cell(r, c), lines, 12, True, TERR_DEEP, PEACH)
            else:
                cell_text(table.cell(r, c), lines, 12, False, INK, WHITE if r % 2 else CREAM)
    tb(
        slide,
        0.45,
        6.7,
        12.3,
        0.35,
        [{"t": "同一件产品：眼镜负责看见，挂脖负责撑住一整天，记忆负责记住这个人今天说过的话。", "sz": 14, "b": True, "c": BODY}],
    )


def slide_engineering(slide):
    header(slide, "ENGINEERING VERIFICATION", "工程已经走通：端、网关、66 项测试", 11)
    cols = [
        (
            "端上三件套",
            TERR,
            [
                ("微信小程序", "「爱总会看见」扫码即用。同声传译在手机上转写。"),
                ("Android 中转", "PhoneHub 走 8788 端口，丢掉堆着的旧帧，并管理 Wi-Fi 摄像头。"),
                ("眼镜播报页", "不打开摄像头。按住说话，双耳扬声器马上出声。"),
            ],
        ),
        (
            "云端网关在线",
            GOLD,
            [
                ("地址", "watchapi.divesee.com，Docker 一条命令拉起。"),
                ("会话锁", "INFER_LOCKS。上一帧超过 2.5 秒就丢弃，不播过时的话。"),
                ("模型可换", "OpenAI 兼容。MiMo、Qwen-VL、MiniCPM 热切换。"),
            ],
        ),
        (
            "66 项自动测试",
            SAGE,
            [
                ("任务状态", "test_task_memory.py 守住 new / keep / refine / switch / done。"),
                ("长期记忆", "test_long_memory.py 守住 24 小时清除、三类权重、最多 20 条。"),
                ("融合安全", "test_fusion.py 守住方向冲突改未确定、高风险只升不降。"),
            ],
        ),
    ]
    for i, (title, accent, items) in enumerate(cols):
        x = 0.48 + i * 4.16
        rect(slide, x, 1.4, 4.0, 5.5, WHITE, LINE, 0.08, shadow=True)
        header_bg = CREAM if accent != SAGE else SAGE_BG
        rect(slide, x + 0.16, 1.56, 3.68, 0.56, header_bg, radius=0.22)
        add_glasses(slide, x + 0.28, 1.64, 0.55, 0.36, accent, 1.4, WHITE)
        tb(
            slide,
            x + 0.92,
            1.62,
            2.75,
            0.44,
            [{"t": title, "sz": 16, "b": True, "c": accent}],
            anchor=MSO_ANCHOR.MIDDLE,
        )
        yy = 2.35
        for name, desc in items:
            tb(slide, x + 0.24, yy, 3.52, 0.32, [{"t": name, "sz": 15, "b": True, "c": INK}])
            tb(slide, x + 0.24, yy + 0.38, 3.52, 0.85, [{"t": desc, "sz": 14, "c": BODY, "ls": 1.05}])
            yy += 1.4


def slide_business(slide):
    header(slide, "BUSINESS  &  COMMERCIALIZATION", "普惠闭环：让每一位视障者都用得起", 12)
    cols = [
        (
            "C",
            "给本人和家人",
            TERR,
            PEACH,
            "亲属可以代付",
            [
                "挂脖环加 3D 打样镜架，成本约 200–400 元，不到竞品的 1/50。",
                "小程序几十元一个月。子女、亲属代付，是自然入口。",
                "还没有眼镜时，普通手机也能先扫码用起来。",
            ],
        ),
        (
            "B",
            "给便利店和商超",
            GOLD,
            GOLD_BG,
            "零障碍示范店",
            [
                "视障顾客进店可借眼镜，货架按身体参照来导览。",
                "品牌把它做成 ESG 里看得见的一件事。",
                "使用路径反过来，帮门店改货架和盲道动线。",
            ],
        ),
        (
            "G",
            "给残联和养老",
            SAGE,
            SAGE_BG,
            "辅具与居家安全",
            [
                "争取进入残联辅具目录，补贴申领或免费发放。",
                "同一套话术给独居老人：找药、防跌、厨房安全。",
                "对齐无障碍环境建设法里的真实场景。",
            ],
        ),
    ]
    for i, (mark, title, accent, bg, tag, items) in enumerate(cols):
        x = 0.48 + i * 4.16
        rect(slide, x, 1.4, 4.0, 5.5, WHITE, LINE, 0.08, shadow=True)
        circ = slide.shapes.add_shape(MSO_SHAPE.OVAL, Inches(x + 0.24), Inches(1.62), Inches(0.62), Inches(0.62))
        _fill(circ, accent)
        _noline(circ)
        tb(
            slide,
            x + 0.24,
            1.62,
            0.62,
            0.62,
            [{"t": mark, "sz": 18, "b": True, "c": WHITE, "align": PP_ALIGN.CENTER}],
            anchor=MSO_ANCHOR.MIDDLE,
        )
        tb(slide, x + 1.02, 1.62, 2.75, 0.34, [{"t": title, "sz": 16, "b": True, "c": INK}])
        chip(slide, x + 1.02, 2.02, 2.15, 0.32, tag, bg, accent, 12)
        yy = 2.6
        for item in items:
            marker(slide, x + 0.28, yy + 0.08, accent)
            tb(slide, x + 0.52, yy, 3.22, 1.05, [{"t": item, "sz": 14, "c": BODY, "ls": 1.08}])
            yy += 1.25


def slide_close(slide):
    tb(slide, 0.7, 0.48, 8.5, 0.32, [{"t": "初心与愿景", "sz": 15, "b": True, "c": TERR}])
    tb(
        slide,
        0.68,
        0.95,
        8.3,
        1.7,
        [
            {"t": "让那位不敢出门的她，", "sz": 32, "b": True, "c": INK},
            {"t": "多敢走一步。", "sz": 32, "b": True, "c": INK, "sb": 2},
        ],
    )
    tb(
        slide,
        0.7,
        2.75,
        8.0,
        1.15,
        [
            {"t": "让货架前的手，知道往哪伸。", "sz": 24, "b": True, "c": TERR},
        ],
    )
    tb(
        slide,
        0.7,
        4.05,
        7.9,
        1.35,
        [
            {
                "t": "它不替代导盲手杖，也不替代人。它让视障朋友在便利店里，少一次开口求人。双 Agent、会在 24 小时后自己忘掉的记忆、挂脖撑住的一整天——温度，落成下一步。",
                "sz": 16,
                "c": BODY,
                "ls": 1.2,
            }
        ],
    )
    tb(slide, 0.7, 5.55, 7.6, 0.36, [{"t": "敬请各位专家评委批评指正", "sz": 16, "b": True, "c": INK}])
    tb(
        slide,
        0.7,
        6.05,
        7.8,
        0.7,
        [
            {"t": "体验演示    watchapi.divesee.com", "sz": 15, "b": True, "c": TERR},
            {"t": "微信小程序    爱总会看见", "sz": 15, "b": True, "c": TERR, "sb": 4},
        ],
    )

    rect(slide, 8.7, 0.85, 4.05, 5.55, CREAM, LINE, 0.1, shadow=True)
    add_glasses(slide, 9.05, 1.15, 3.35, 1.45, TERR, 2.4, WHITE)
    tb(
        slide,
        8.95,
        2.75,
        3.55,
        0.7,
        [{"t": "按这个人来的下一步", "sz": 16, "b": True, "c": INK, "align": PP_ALIGN.CENTER}],
    )
    chip(slide, 9.15, 3.6, 1.45, 0.4, "左前方", WHITE, TERR_DEEP, 13)
    chip(slide, 10.75, 3.6, 1.55, 0.4, "手高这层", WHITE, TERR_DEEP, 13)
    chip(slide, 9.15, 4.15, 1.45, 0.4, "一臂内", WHITE, TERR_DEEP, 13)
    chip(slide, 10.75, 4.15, 1.7, 0.4, "无糖乌龙茶", WHITE, TERR_DEEP, 13)
    tb(
        slide,
        9.05,
        4.8,
        3.4,
        1.2,
        [
            {
                "t": "方向、高度、距离，再加上今天才说过的偏好。说完能动手，过一天不留底。",
                "sz": 14,
                "c": BODY,
                "align": PP_ALIGN.CENTER,
                "ls": 1.15,
            }
        ],
    )
    page_no(slide, 13)


def build(path: str) -> None:
    prs = Presentation()
    prs.slide_width = Emu(SLIDE_W)
    prs.slide_height = Emu(SLIDE_H)
    prs.core_properties.title = "看见下一步 · 智能眼镜路演"
    prs.core_properties.subject = "面向视障人群的双Agent随身智能眼镜"
    prs.core_properties.category = "路演"
    prs.core_properties.keywords = "视障,智能眼镜,双Agent,个性化记忆"
    set_master_and_theme(prs)
    layout = blank_layout(prs)
    builders = [
        slide_cover,
        slide_pain,
        slide_hardware,
        slide_states,
        slide_agents,
        slide_intent,
        slide_weights,
        slide_memory,
        slide_space,
        slide_market,
        slide_engineering,
        slide_business,
        slide_close,
    ]
    for build_slide in builders:
        slide = prs.slides.add_slide(layout)
        build_slide(slide)
    prs.save(path)


if __name__ == "__main__":
    out = "/workspace/看见下一步_智能眼镜路演PPT.pptx"
    build(out)
    print(out)
