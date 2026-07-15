from __future__ import annotations

from html import escape
from io import BytesIO
import logging
from pathlib import Path as FilePath
from typing import Any

from reportlab.graphics.shapes import Drawing
from reportlab.lib import colors
from reportlab.lib.enums import TA_RIGHT
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
from svglib.svglib import svg2rlg


FOREST = colors.HexColor("#12270F")
SAGE = colors.HexColor("#729152")
CREAM = colors.HexColor("#F7F5F0")
TEXT = colors.HexColor("#1C1C1A")
MUTED = colors.HexColor("#5A5A58")
BORDER = colors.HexColor("#D8D4CC")
SUCCESS_BG = colors.HexColor("#D1FAE5")
SUCCESS_TEXT = colors.HexColor("#065F46")
WARNING_BG = colors.HexColor("#FEF3C7")
WARNING_TEXT = colors.HexColor("#92400E")

_ASSETS_DIR = FilePath(__file__).resolve().parent.parent / "assets"
logger = logging.getLogger(__name__)


def _p(value: Any) -> str:
    return escape(str(value or "").strip()).replace("\n", "<br/>")


def _money(value: Any, currency: str) -> str:
    return f"{currency} ${float(value or 0):,.2f}"


def _logo() -> Drawing:
    """Load the real SVG logo and scale it to 54x54 for the PDF header.

    Returns an empty Drawing if the SVG file is missing or fails to parse,
    so a missing asset does not crash the PDF export endpoint.
    """
    svg_path = _ASSETS_DIR / "logo-color.svg"
    try:
        drawing = svg2rlg(str(svg_path))
    except Exception:
        logger.warning("Failed to load invoice logo", exc_info=True)
        drawing = None
    if drawing is None or drawing.width == 0:
        return Drawing(54, 54)
    # Scale from the SVG's native size (120x120 viewBox) down to 54x54
    scale = 54.0 / drawing.width
    drawing.width = 54
    drawing.height = 54
    drawing.renderScale = scale
    drawing.transform = (scale, 0, 0, scale, 0, 0)
    return drawing


def _styles() -> dict[str, ParagraphStyle]:
    return {
        "title": ParagraphStyle(
            "invoice_title",
            fontName="Helvetica-Bold",
            fontSize=25,
            leading=28,
            textColor=FOREST,
            alignment=TA_RIGHT,
        ),
        "number": ParagraphStyle(
            "invoice_number",
            fontName="Helvetica-Bold",
            fontSize=10,
            leading=13,
            textColor=SAGE,
            alignment=TA_RIGHT,
        ),
        "label": ParagraphStyle(
            "invoice_label",
            fontName="Helvetica-Bold",
            fontSize=7,
            leading=9,
            textColor=SAGE,
            spaceAfter=3,
        ),
        "body": ParagraphStyle(
            "invoice_body", fontName="Helvetica", fontSize=9, leading=12, textColor=TEXT
        ),
        "body_bold": ParagraphStyle(
            "invoice_body_bold",
            fontName="Helvetica-Bold",
            fontSize=9,
            leading=12,
            textColor=TEXT,
        ),
        "small": ParagraphStyle(
            "invoice_small",
            fontName="Helvetica",
            fontSize=7.5,
            leading=10,
            textColor=MUTED,
        ),
        "table_head": ParagraphStyle(
            "invoice_table_head",
            fontName="Helvetica-Bold",
            fontSize=8,
            leading=10,
            textColor=colors.white,
        ),
        "table_cell": ParagraphStyle(
            "invoice_table_cell",
            fontName="Helvetica",
            fontSize=8,
            leading=10,
            textColor=TEXT,
        ),
        "table_right": ParagraphStyle(
            "invoice_table_right",
            fontName="Helvetica",
            fontSize=8,
            leading=10,
            textColor=TEXT,
            alignment=TA_RIGHT,
        ),
        "total": ParagraphStyle(
            "invoice_total",
            fontName="Helvetica-Bold",
            fontSize=11,
            leading=13,
            textColor=FOREST,
            alignment=TA_RIGHT,
        ),
    }


def _payment_label(payment: dict[str, Any]) -> str:
    method = payment.get("payment_method")
    if method == "etransfer":
        return "E-transfer"
    if method == "cash":
        return "Cash"
    if method == "other":
        return str(payment.get("payment_method_other") or "Other")
    return ""


def build_invoice_pdf(
    *,
    invoice_number: str,
    snapshot: dict[str, Any],
    payment: dict[str, Any],
    line_items: list[dict[str, Any]],
    amounts: dict[str, Any],
) -> bytes:
    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=letter,
        leftMargin=0.62 * inch,
        rightMargin=0.62 * inch,
        topMargin=0.55 * inch,
        bottomMargin=0.55 * inch,
        title=invoice_number,
        author="Loku Caters",
    )
    styles = _styles()
    vendor = snapshot.get("vendor") or {}
    customer = snapshot.get("customer") or {}
    invoice = snapshot.get("invoice") or {}
    order = snapshot.get("order") or {}
    invoice_amounts = amounts
    currency = str(snapshot.get("currency") or "")

    story: list[Any] = []
    # Total usable width: letter (8.5") - 2 * 0.62" margins = 7.26"
    # Use a consistent content width across all sections
    CONTENT_W = 6.86 * inch
    header = Table(
        [
            [
                _logo(),
                Paragraph(
                    f"<b>{_p(vendor.get('business_name') or 'Loku Caters')}</b>",
                    styles["body_bold"],
                ),
                [
                    Paragraph("INVOICE", styles["title"]),
                    Paragraph(_p(invoice_number), styles["number"]),
                ],
            ]
        ],
        colWidths=[0.72 * inch, 2.84 * inch, 3.30 * inch],
    )
    header.setStyle(
        TableStyle(
            [
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ("RIGHTPADDING", (0, 0), (-1, -1), 0),
            ]
        )
    )
    story.extend([header, Spacer(1, 18)])

    vendor_lines = [
        vendor.get("business_address"),
        vendor.get("business_email"),
        vendor.get("business_phone"),
    ]
    customer_lines = [customer.get("email"), customer.get("phone")]
    from_block = [
        Paragraph("FROM", styles["label"]),
        Paragraph(_p(vendor.get("business_name")), styles["body_bold"]),
    ]
    from_block.extend(
        Paragraph(_p(line), styles["body"]) for line in vendor_lines if line
    )
    bill_block = [
        Paragraph("BILL TO", styles["label"]),
        Paragraph(_p(customer.get("name")), styles["body_bold"]),
    ]
    bill_block.extend(
        Paragraph(_p(line), styles["body"]) for line in customer_lines if line
    )
    meta_rows = [
        [
            Paragraph("ISSUE DATE", styles["label"]),
            Paragraph(_p(invoice.get("issue_date")), styles["body_bold"]),
        ],
        [
            Paragraph("DUE DATE", styles["label"]),
            Paragraph(_p(invoice.get("due_date")), styles["body_bold"]),
        ],
    ]
    if order.get("reference"):
        meta_rows.append(
            [
                Paragraph("ORDER REF", styles["label"]),
                Paragraph(_p(order.get("reference")), styles["body_bold"]),
            ]
        )
    meta_inner = Table(meta_rows, colWidths=[0.78 * inch, 1.25 * inch])
    meta_inner.setStyle(
        TableStyle(
            [
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                ("TOPPADDING", (0, 0), (-1, -1), 2),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
            ]
        )
    )
    blocks = Table(
        [[from_block, bill_block, meta_inner]],
        colWidths=[2.29 * inch, 2.29 * inch, 2.28 * inch],
    )
    blocks.setStyle(
        TableStyle(
            [
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("BOX", (0, 0), (-1, -1), 0.6, BORDER),
                ("INNERGRID", (0, 0), (-1, -1), 0.4, BORDER),
                ("BACKGROUND", (0, 0), (-1, -1), colors.white),
                ("LEFTPADDING", (0, 0), (-1, -1), 12),
                ("RIGHTPADDING", (0, 0), (-1, -1), 12),
                ("TOPPADDING", (0, 0), (-1, -1), 10),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
            ]
        )
    )
    story.extend([blocks, Spacer(1, 14)])

    paid = bool(payment.get("paid"))
    status_text = "PAID" if paid else "PAYMENT DUE"
    status_bg = SUCCESS_BG if paid else WARNING_BG
    status_color = SUCCESS_TEXT if paid else WARNING_TEXT
    status_detail = (
        _payment_label(payment)
        if paid
        else _money(invoice_amounts.get("total"), currency)
    )
    status = Table(
        [
            [
                Paragraph(
                    f"<b>{status_text}</b>",
                    ParagraphStyle(
                        "status",
                        fontName="Helvetica-Bold",
                        fontSize=8,
                        textColor=status_color,
                    ),
                ),
                Paragraph(
                    _p(status_detail),
                    ParagraphStyle(
                        "status_detail",
                        fontName="Helvetica-Bold",
                        fontSize=8,
                        textColor=status_color,
                        alignment=TA_RIGHT,
                    ),
                ),
            ]
        ],
        colWidths=[CONTENT_W / 2, CONTENT_W / 2],
    )
    status.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), status_bg),
                ("BOX", (0, 0), (-1, -1), 0.5, status_color),
                ("LEFTPADDING", (0, 0), (-1, -1), 10),
                ("RIGHTPADDING", (0, 0), (-1, -1), 10),
                ("TOPPADDING", (0, 0), (-1, -1), 7),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
            ]
        )
    )
    story.extend([status, Spacer(1, 14)])

    rows = [
        [
            Paragraph("ITEM", styles["table_head"]),
            Paragraph("QTY", styles["table_head"]),
            Paragraph("UNIT PRICE", styles["table_head"]),
            Paragraph("SUBTOTAL", styles["table_head"]),
        ]
    ]
    for line in line_items:
        rows.append(
            [
                Paragraph(_p(line.get("description")), styles["table_cell"]),
                Paragraph(str(int(line.get("quantity") or 0)), styles["table_right"]),
                Paragraph(
                    _money(line.get("unit_price"), currency), styles["table_right"]
                ),
                Paragraph(
                    _money(line.get("subtotal"), currency), styles["table_right"]
                ),
            ]
        )
    items = Table(
        rows,
        colWidths=[3.26 * inch, 0.60 * inch, 1.45 * inch, 1.55 * inch],
        repeatRows=1,
    )
    item_style = [
        ("BACKGROUND", (0, 0), (-1, 0), FOREST),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, 0), 8),
        ("BOTTOMPADDING", (0, 0), (-1, 0), 8),
        ("TOPPADDING", (0, 1), (-1, -1), 7),
        ("BOTTOMPADDING", (0, 1), (-1, -1), 7),
        ("LINEBELOW", (0, 1), (-1, -1), 0.4, BORDER),
    ]
    for row_index in range(1, len(rows)):
        if row_index % 2 == 0:
            item_style.append(("BACKGROUND", (0, row_index), (-1, row_index), CREAM))
    items.setStyle(TableStyle(item_style))
    story.extend([items, Spacer(1, 12)])

    totals_data = [
        [
            Paragraph("Subtotal", styles["body"]),
            Paragraph(
                _money(invoice_amounts.get("subtotal"), currency), styles["table_right"]
            ),
        ]
    ]
    if float(invoice_amounts.get("discount_total") or 0) > 0:
        totals_data.append(
            [
                Paragraph("Discount", styles["body"]),
                Paragraph(
                    f"-{_money(invoice_amounts.get('discount_total'), currency)}",
                    styles["table_right"],
                ),
            ]
        )
    totals_data.append(
        [
            Paragraph("TOTAL", styles["body_bold"]),
            Paragraph(_money(invoice_amounts.get("total"), currency), styles["total"]),
        ]
    )
    totals = Table(totals_data, colWidths=[1.4 * inch, 1.55 * inch], hAlign="RIGHT")
    totals.setStyle(
        TableStyle(
            [
                ("LINEABOVE", (0, -1), (-1, -1), 1, FOREST),
                ("TOPPADDING", (0, 0), (-1, -1), 6),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
                ("LEFTPADDING", (0, 0), (-1, -1), 4),
                ("RIGHTPADDING", (0, 0), (-1, -1), 4),
            ]
        )
    )
    story.extend([totals, Spacer(1, 18)])

    note_parts: list[Any] = []
    if invoice.get("memo"):
        note_parts.extend(
            [
                Paragraph("MEMO", styles["label"]),
                Paragraph(_p(invoice.get("memo")), styles["body"]),
                Spacer(1, 10),
            ]
        )
    if not paid and vendor.get("payment_method") != "none":
        payment_text = {
            "etransfer": "E-transfer",
            "cash": "Cash",
            "other": "Other",
        }.get(vendor.get("payment_method"), "Payment")
        if vendor.get("payment_method") == "etransfer" and vendor.get("payment_email"):
            payment_text += f" to {_p(vendor.get('payment_email'))}"
        if vendor.get("payment_instructions"):
            payment_text += f"<br/>{_p(vendor.get('payment_instructions'))}"
        note_parts.extend(
            [
                Paragraph("PAYMENT", styles["label"]),
                Paragraph(payment_text, styles["body"]),
            ]
        )
    if note_parts:
        payment_box = Table([[note_parts]], colWidths=[6.5 * inch])
        payment_box.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, -1), CREAM),
                    ("BOX", (0, 0), (-1, -1), 0.5, BORDER),
                    ("LEFTPADDING", (0, 0), (-1, -1), 12),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 12),
                    ("TOPPADDING", (0, 0), (-1, -1), 10),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
                ]
            )
        )
        story.extend([payment_box, Spacer(1, 12)])
    if vendor.get("default_footer_note"):
        story.append(Paragraph(_p(vendor.get("default_footer_note")), styles["small"]))

    def add_page_number(canvas, document) -> None:
        canvas.saveState()
        canvas.setFont("Helvetica", 7)
        canvas.setFillColor(MUTED)
        canvas.drawRightString(
            letter[0] - 0.62 * inch, 0.3 * inch, f"Page {document.page}"
        )
        canvas.restoreState()

    doc.build(story, onFirstPage=add_page_number, onLaterPages=add_page_number)
    return buffer.getvalue()
