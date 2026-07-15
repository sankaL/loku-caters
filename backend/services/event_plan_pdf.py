from __future__ import annotations

from collections import defaultdict
from io import BytesIO
from typing import Any

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import landscape, letter
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle


FOREST = colors.HexColor("#12270F")
SAGE = colors.HexColor("#729152")
CREAM = colors.HexColor("#F7F5F0")
ACCENT = colors.HexColor("#F2AF29")
BORDER = colors.HexColor("#D8D4CC")
TEXT = colors.HexColor("#1C1C1A")
MUTED = colors.HexColor("#5A5A58")
WARNING = colors.HexColor("#92400E")
ERROR = colors.HexColor("#991B1B")
LOCATION_PALETTES = [
    {
        "header": colors.HexColor("#FBF3DB"),
        "header_text": colors.HexColor("#5F4300"),
        "band": colors.HexColor("#956400"),
        "band_text": colors.white,
    },
    {
        "header": colors.HexColor("#EDF3EC"),
        "header_text": colors.HexColor("#234D29"),
        "band": colors.HexColor("#346538"),
        "band_text": colors.white,
    },
    {
        "header": colors.HexColor("#E1F3FE"),
        "header_text": colors.HexColor("#164F75"),
        "band": colors.HexColor("#1F6C9F"),
        "band_text": colors.white,
    },
    {
        "header": colors.HexColor("#FDEBEC"),
        "header_text": colors.HexColor("#7D2523"),
        "band": colors.HexColor("#9F2F2D"),
        "band_text": colors.white,
    },
    {
        "header": colors.HexColor("#F0EFEB"),
        "header_text": colors.HexColor("#3F3D38"),
        "band": colors.HexColor("#6F6A60"),
        "band_text": colors.white,
    },
]


def _text(value: Any) -> str:
    return str(value or "").strip()


def _quantity(value: Any) -> int:
    try:
        return int(value or 0)
    except (TypeError, ValueError):
        return 0


def _status_label(status: str) -> str:
    labels = {
        "pending": "Pending",
        "confirmed": "Confirmed",
        "picked_up": "Picked Up",
        "no_show": "No Show",
        "mixed": "Mixed",
        "extra": "Extra",
    }
    return labels.get(status, status.replace("_", " ").title())


def _base_location_name(location: str) -> str:
    value = _text(location)
    if " part " in value:
        return value.rsplit(" part ", 1)[0]
    return value


def _location_palette(location: str) -> dict[str, colors.Color]:
    base = _base_location_name(location)
    index = sum(ord(char) for char in base) % len(LOCATION_PALETTES)
    return LOCATION_PALETTES[index]


def _styles() -> dict[str, ParagraphStyle]:
    return {
        "title": ParagraphStyle(
            "title",
            fontName="Helvetica-Bold",
            fontSize=18,
            leading=21,
            textColor=FOREST,
            spaceAfter=4,
        ),
        "meta": ParagraphStyle(
            "meta",
            fontName="Helvetica",
            fontSize=8,
            leading=10,
            textColor=MUTED,
        ),
        "section": ParagraphStyle(
            "section",
            fontName="Helvetica-Bold",
            fontSize=12,
            leading=14,
            textColor=FOREST,
            spaceBefore=6,
            spaceAfter=6,
        ),
        "hero_label": ParagraphStyle(
            "hero_label",
            fontName="Helvetica-Bold",
            fontSize=8,
            leading=10,
            textColor=ACCENT,
            alignment=TA_CENTER,
        ),
        "hero_qty": ParagraphStyle(
            "hero_qty",
            fontName="Helvetica-Bold",
            fontSize=30,
            leading=33,
            textColor=colors.white,
            alignment=TA_CENTER,
        ),
        "hero_caption": ParagraphStyle(
            "hero_caption",
            fontName="Helvetica-Bold",
            fontSize=9,
            leading=11,
            textColor=CREAM,
            alignment=TA_CENTER,
        ),
        "location": ParagraphStyle(
            "location",
            fontName="Helvetica-Bold",
            fontSize=13,
            leading=15,
            textColor=FOREST,
        ),
        "location_label": ParagraphStyle(
            "location_label",
            fontName="Helvetica-Bold",
            fontSize=6,
            leading=8,
            textColor=MUTED,
            alignment=TA_LEFT,
        ),
        "location_qty": ParagraphStyle(
            "location_qty",
            fontName="Helvetica-Bold",
            fontSize=20,
            leading=22,
            textColor=FOREST,
            alignment=TA_RIGHT,
        ),
        "time": ParagraphStyle(
            "time",
            fontName="Helvetica-Bold",
            fontSize=8,
            leading=10,
            textColor=MUTED,
        ),
        "cell": ParagraphStyle(
            "cell",
            fontName="Helvetica",
            fontSize=7,
            leading=8,
            textColor=TEXT,
            alignment=TA_LEFT,
        ),
        "cell_bold": ParagraphStyle(
            "cell_bold",
            fontName="Helvetica-Bold",
            fontSize=7,
            leading=8,
            textColor=TEXT,
            alignment=TA_LEFT,
        ),
        "cell_bold_light": ParagraphStyle(
            "cell_bold_light",
            fontName="Helvetica-Bold",
            fontSize=7,
            leading=8,
            textColor=colors.white,
            alignment=TA_LEFT,
        ),
        "item_qty": ParagraphStyle(
            "item_qty",
            fontName="Helvetica-Bold",
            fontSize=14,
            leading=16,
            textColor=FOREST,
            alignment=TA_RIGHT,
        ),
        "item_total_name": ParagraphStyle(
            "item_total_name",
            fontName="Helvetica-Bold",
            fontSize=8,
            leading=10,
            textColor=TEXT,
        ),
        "item_total_share": ParagraphStyle(
            "item_total_share",
            fontName="Helvetica-Bold",
            fontSize=6,
            leading=8,
            textColor=MUTED,
        ),
        "item_total_qty": ParagraphStyle(
            "item_total_qty",
            fontName="Helvetica-Bold",
            fontSize=18,
            leading=20,
            textColor=FOREST,
            alignment=TA_RIGHT,
        ),
        "cell_right": ParagraphStyle(
            "cell_right",
            fontName="Helvetica-Bold",
            fontSize=7,
            leading=8,
            textColor=TEXT,
            alignment=TA_RIGHT,
        ),
        "cell_right_light": ParagraphStyle(
            "cell_right_light",
            fontName="Helvetica-Bold",
            fontSize=7,
            leading=8,
            textColor=colors.white,
            alignment=TA_RIGHT,
        ),
        "center": ParagraphStyle(
            "center",
            fontName="Helvetica-Bold",
            fontSize=7,
            leading=8,
            textColor=TEXT,
            alignment=TA_CENTER,
        ),
        "warning": ParagraphStyle(
            "warning",
            fontName="Helvetica-Bold",
            fontSize=7,
            leading=8,
            textColor=WARNING,
        ),
        "error": ParagraphStyle(
            "error",
            fontName="Helvetica-Bold",
            fontSize=7,
            leading=8,
            textColor=ERROR,
        ),
    }


def _paragraph(value: Any, style: ParagraphStyle) -> Paragraph:
    return Paragraph(
        _text(value).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;"),
        style,
    )


def _active_rows(snapshot: dict[str, Any]) -> list[dict[str, Any]]:
    return [
        row
        for row in snapshot.get("planned_rows", [])
        if row.get("row_state", "active") == "active"
    ]


def _quantity_breakdown(snapshot: dict[str, Any]) -> list[dict[str, Any]]:
    grouped: dict[str, dict[str, dict[str, int]]] = defaultdict(
        lambda: defaultdict(lambda: defaultdict(int))
    )
    for row in _active_rows(snapshot):
        location = _text(row.get("pickup_location")) or "Unassigned"
        time_slot = _text(row.get("pickup_time_slot")) or "Unassigned"
        item = _text(row.get("planned_item_name")) or "Unassigned"
        grouped[location][time_slot][item] += _quantity(row.get("quantity"))

    result: list[dict[str, Any]] = []
    for location, time_slots in grouped.items():
        next_time_slots = []
        for time_slot, items in time_slots.items():
            item_rows = [
                {"item": item, "quantity": quantity}
                for item, quantity in sorted(
                    items.items(), key=lambda entry: (-entry[1], entry[0])
                )
            ]
            next_time_slots.append(
                {
                    "time_slot": time_slot,
                    "quantity": sum(item["quantity"] for item in item_rows),
                    "items": item_rows,
                }
            )
        next_time_slots.sort(key=lambda entry: entry["time_slot"])
        result.append(
            {
                "location": location,
                "quantity": sum(time_slot["quantity"] for time_slot in next_time_slots),
                "time_slots": next_time_slots,
            }
        )
    return sorted(result, key=lambda entry: (-entry["quantity"], entry["location"]))


def _item_type_totals(snapshot: dict[str, Any]) -> list[dict[str, Any]]:
    grouped: dict[str, int] = defaultdict(int)
    for row in _active_rows(snapshot):
        item = _text(row.get("planned_item_name")) or "Unassigned"
        grouped[item] += _quantity(row.get("quantity"))
    total_quantity = sum(grouped.values())
    return [
        {
            "item": item,
            "quantity": quantity,
            "share": round((quantity / total_quantity) * 100) if total_quantity else 0,
        }
        for item, quantity in sorted(
            grouped.items(), key=lambda entry: (-entry[1], entry[0])
        )
    ]


def _customer_rows(snapshot: dict[str, Any]) -> list[dict[str, Any]]:
    bundle_notes = {
        str(bundle.get("bundle_id")): _text(bundle.get("order_notes"))
        for bundle in snapshot.get("bundles", [])
    }
    grouped: dict[tuple[str, str, str, str, str], list[str]] = defaultdict(list)
    row_notes: dict[tuple[str, str, str, str, str], list[str]] = defaultdict(list)
    for row in _active_rows(snapshot):
        key = (
            _text(row.get("pickup_location")) or "Unassigned",
            _text(row.get("pickup_time_slot")) or "Unassigned",
            _text(row.get("customer_name")) or "Extra",
            _status_label(_text(row.get("status")) or "extra"),
            _text(row.get("source_bundle_id")),
        )
        grouped[key].append(
            f"{_text(row.get('planned_item_name'))} x{_quantity(row.get('quantity'))}"
        )
        note = _text(row.get("notes"))
        if note:
            row_notes[key].append(note)
    result: list[dict[str, Any]] = []
    for key, items in sorted(grouped.items()):
        location, time_slot, customer, status, bundle_id = key
        notes = [bundle_notes.get(bundle_id, "")]
        notes.extend(row_notes.get(key, []))
        result.append(
            {
                "location": location,
                "time_slot": time_slot,
                "customer": customer,
                "status": status,
                "items": ", ".join(items),
                "notes": "; ".join(note for note in notes if note),
            }
        )
    return result


def _status_rows(snapshot: dict[str, Any]) -> list[list[Any]]:
    rows = []
    for status, value in sorted((snapshot.get("status_breakdown") or {}).items()):
        rows.append(
            [
                _status_label(status),
                str(value.get("orders", 0)),
                str(value.get("quantity", 0)),
            ]
        )
    return rows


def _summary_table(
    snapshot: dict[str, Any], styles: dict[str, ParagraphStyle]
) -> Table:
    totals = snapshot.get("totals") or {}
    warnings = snapshot.get("warnings") or []
    data = [
        [
            _paragraph("Orders", styles["meta"]),
            _paragraph(str(totals.get("included_order_count", 0)), styles["center"]),
        ],
        [
            _paragraph("Ordered Qty", styles["meta"]),
            _paragraph(str(totals.get("ordered_quantity", 0)), styles["center"]),
        ],
        [
            _paragraph("Planned Qty", styles["meta"]),
            _paragraph(str(totals.get("planned_quantity", 0)), styles["center"]),
        ],
        [
            _paragraph("Warnings", styles["meta"]),
            _paragraph(str(len(warnings)), styles["center"]),
        ],
    ]
    table = Table(data, colWidths=[1.0 * inch, 0.55 * inch], hAlign="RIGHT")
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), CREAM),
                ("BOX", (0, 0), (-1, -1), 0.6, BORDER),
                ("INNERGRID", (0, 0), (-1, -1), 0.3, BORDER),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("LEFTPADDING", (0, 0), (-1, -1), 5),
                ("RIGHTPADDING", (0, 0), (-1, -1), 5),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ]
        )
    )
    return table


def _build_table(
    headers: list[str],
    rows: list[list[Any]],
    widths: list[float],
    styles: dict[str, ParagraphStyle],
) -> Table:
    data = [[_paragraph(header, styles["cell_bold"]) for header in headers]]
    for row in rows:
        data.append([_paragraph(value, styles["cell"]) for value in row])
    table = Table(data, colWidths=widths, repeatRows=1, hAlign="LEFT")
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), CREAM),
                ("TEXTCOLOR", (0, 0), (-1, 0), FOREST),
                ("BOX", (0, 0), (-1, -1), 0.6, BORDER),
                ("INNERGRID", (0, 0), (-1, -1), 0.25, BORDER),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 4),
                ("RIGHTPADDING", (0, 0), (-1, -1), 4),
                ("TOPPADDING", (0, 0), (-1, -1), 3),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
            ]
        )
    )
    return table


def _progress_bar(share: int, *, width: float = 1.65 * inch) -> Table:
    fill_width = max(0.06 * inch, width * min(max(share, 0), 100) / 100)
    rest_width = max(0.01 * inch, width - fill_width)
    table = Table(
        [["", ""]], colWidths=[fill_width, rest_width], rowHeights=[0.05 * inch]
    )
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (0, 0), SAGE),
                ("BACKGROUND", (1, 0), (1, 0), colors.HexColor("#ECEAE5")),
                ("BOX", (0, 0), (-1, -1), 0, colors.white),
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                ("TOPPADDING", (0, 0), (-1, -1), 0),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
            ]
        )
    )
    return table


def _item_total_card(item: dict[str, Any], styles: dict[str, ParagraphStyle]) -> Table:
    data = [
        [
            [
                _paragraph(item["item"], styles["item_total_name"]),
                _paragraph(f"{item['share']}% of plan", styles["item_total_share"]),
                Spacer(1, 2),
                _progress_bar(int(item["share"])),
            ],
            _paragraph(str(item["quantity"]), styles["item_total_qty"]),
        ]
    ]
    table = Table(data, colWidths=[1.72 * inch, 0.48 * inch], rowHeights=[0.62 * inch])
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), colors.white),
                ("BOX", (0, 0), (-1, -1), 0.6, BORDER),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("LEFTPADDING", (0, 0), (-1, -1), 7),
                ("RIGHTPADDING", (0, 0), (-1, -1), 7),
                ("TOPPADDING", (0, 0), (-1, -1), 6),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ]
        )
    )
    return table


def _item_total_cards(
    snapshot: dict[str, Any], styles: dict[str, ParagraphStyle]
) -> Table:
    totals = _item_type_totals(snapshot)
    if not totals:
        return _build_table(
            ["Item Totals"], [["No planned items"]], [9.35 * inch], styles
        )
    cells: list[list[Any]] = []
    row: list[Any] = []
    for item in totals:
        row.append(_item_total_card(item, styles))
        if len(row) == 4:
            cells.append(row)
            row = []
    if row:
        row.extend([""] * (4 - len(row)))
        cells.append(row)
    table = Table(cells, colWidths=[2.25 * inch] * 4, hAlign="LEFT")
    table.setStyle(
        TableStyle(
            [
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ("RIGHTPADDING", (0, 0), (-1, -1), 7),
                ("TOPPADDING", (0, 0), (-1, -1), 0),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
            ]
        )
    )
    return table


def _quantity_location_card(
    location: dict[str, Any], styles: dict[str, ParagraphStyle]
) -> Table:
    palette = _location_palette(location["location"])
    data: list[list[Any]] = [
        [
            [
                _paragraph("Location", styles["location_label"]),
                Spacer(1, 2),
                _paragraph(location["location"], styles["location"]),
            ],
            _paragraph(str(location["quantity"]), styles["location_qty"]),
        ],
    ]
    row_styles: list[tuple[Any, ...]] = [
        ("BACKGROUND", (0, 0), (-1, 0), palette["header"]),
        ("BOX", (0, 0), (-1, 0), 0.6, BORDER),
        ("TEXTCOLOR", (0, 0), (-1, 0), palette["header_text"]),
    ]
    row_index = 1
    for time_slot in location.get("time_slots", []):
        data.append(
            [
                _paragraph(time_slot["time_slot"], styles["cell_bold_light"]),
                _paragraph(str(time_slot["quantity"]), styles["cell_right_light"]),
            ]
        )
        row_styles.extend(
            [
                ("BACKGROUND", (0, row_index), (-1, row_index), palette["band"]),
                ("TEXTCOLOR", (0, row_index), (-1, row_index), palette["band_text"]),
            ]
        )
        row_index += 1
        for item in time_slot.get("items", []):
            data.append(
                [
                    _paragraph(item["item"], styles["cell_bold"]),
                    _paragraph(str(item["quantity"]), styles["cell_right"]),
                ]
            )
            row_styles.append(
                (
                    "BACKGROUND",
                    (0, row_index),
                    (-1, row_index),
                    colors.white if row_index % 2 == 0 else CREAM,
                )
            )
            row_index += 1
    table = Table(data, colWidths=[1.92 * inch, 0.52 * inch], hAlign="LEFT")
    table.setStyle(
        TableStyle(
            [
                ("BOX", (0, 0), (-1, -1), 0.6, BORDER),
                ("INNERGRID", (0, 1), (-1, -1), 0.2, colors.HexColor("#E8E2D8")),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("LEFTPADDING", (0, 0), (-1, -1), 7),
                ("RIGHTPADDING", (0, 0), (-1, -1), 7),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                ("TOPPADDING", (0, 0), (-1, 0), 9),
                ("BOTTOMPADDING", (0, 0), (-1, 0), 9),
                *row_styles,
            ]
        )
    )
    return table


def _quantity_cards(
    snapshot: dict[str, Any], styles: dict[str, ParagraphStyle]
) -> list[Table]:
    locations = _quantity_breakdown(snapshot)
    if not locations:
        return [
            _build_table(
                ["Order Quantity Breakdown"],
                [["No planned rows"]],
                [9.35 * inch],
                styles,
            )
        ]
    split_locations = _split_quantity_graph_locations(locations, max_items_per_graph=9)
    tables: list[Table] = []
    for index in range(0, len(split_locations), 3):
        cells = [
            [
                _quantity_location_card(location, styles)
                for location in split_locations[index : index + 3]
            ]
        ]
        cells[0].extend([""] * (3 - len(cells[0])))
        table = Table(cells, colWidths=[3.12 * inch] * 3, hAlign="LEFT")
        table.setStyle(
            TableStyle(
                [
                    ("VALIGN", (0, 0), (-1, -1), "TOP"),
                    ("LEFTPADDING", (0, 0), (-1, -1), 0),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 10),
                    ("TOPPADDING", (0, 0), (-1, -1), 0),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
                ]
            )
        )
        tables.append(table)
    return tables


def _split_quantity_graph_locations(
    locations: list[dict[str, Any]], max_items_per_graph: int = 6
) -> list[dict[str, Any]]:
    result: list[dict[str, Any]] = []
    for location in locations:
        current_slots: list[dict[str, Any]] = []
        current_items = 0
        part = 1

        def flush() -> None:
            nonlocal current_slots, current_items, part
            if not current_slots:
                return
            suffix = f" part {part}" if part > 1 else ""
            result.append(
                {
                    **location,
                    "location": f"{location['location']}{suffix}",
                    "quantity": sum(slot["quantity"] for slot in current_slots),
                    "time_slots": current_slots,
                }
            )
            current_slots = []
            current_items = 0
            part += 1

        for time_slot in location.get("time_slots", []):
            items = time_slot.get("items", [])
            if not items:
                if current_items + 1 > max_items_per_graph:
                    flush()
                current_slots.append(time_slot)
                current_items += 1
                continue

            for index in range(0, len(items), max_items_per_graph):
                chunk = items[index : index + max_items_per_graph]
                if current_items + len(chunk) > max_items_per_graph:
                    flush()
                current_slots.append(
                    {
                        **time_slot,
                        "quantity": sum(item["quantity"] for item in chunk),
                        "items": chunk,
                    }
                )
                current_items += len(chunk)

        flush()
    return result


def build_event_plan_pdf(
    *, plan_name: str, status: str, snapshot: dict[str, Any]
) -> bytes:
    styles = _styles()
    source = snapshot.get("source_event") or {}
    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=landscape(letter),
        rightMargin=0.35 * inch,
        leftMargin=0.35 * inch,
        topMargin=0.28 * inch,
        bottomMargin=0.28 * inch,
    )

    story: list[Any] = []
    heading = Table(
        [
            [
                [
                    _paragraph(plan_name, styles["title"]),
                    _paragraph(
                        f"{_text(source.get('name'))} | {_text(source.get('event_date'))} | {_status_label(status)}",
                        styles["meta"],
                    ),
                ],
                _summary_table(snapshot, styles),
            ]
        ],
        colWidths=[7.7 * inch, 1.65 * inch],
    )
    heading.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP")]))
    story.append(heading)

    plan_notes = _text(snapshot.get("plan_notes"))
    if plan_notes:
        story.append(Spacer(1, 5))
        story.append(_paragraph(f"Plan notes: {plan_notes}", styles["cell_bold"]))

    warnings = snapshot.get("warnings") or []
    if warnings:
        warning_text = "; ".join(_text(item.get("message")) for item in warnings[:3])
        if len(warnings) > 3:
            warning_text = f"{warning_text}; {len(warnings) - 3} more warning(s)"
        story.append(Spacer(1, 4))
        story.append(_paragraph(f"Warnings: {warning_text}", styles["warning"]))

    story.append(Spacer(1, 7))
    story.append(_paragraph("Item Totals", styles["section"]))
    story.append(_item_total_cards(snapshot, styles))

    story.append(Spacer(1, 7))
    story.append(_paragraph("Order Quantity Breakdown", styles["section"]))
    for table in _quantity_cards(snapshot, styles):
        story.append(table)
        story.append(Spacer(1, 8))

    handoff_rows = [
        [
            entry["location"],
            entry["time_slot"],
            entry["customer"],
            entry["status"],
            entry["items"],
            entry["notes"],
        ]
        for entry in _customer_rows(snapshot)
    ]
    story.append(Spacer(1, 7))
    story.append(_paragraph("Customer Handoff", styles["section"]))
    story.append(
        _build_table(
            ["Location", "Time", "Customer", "Status", "Items", "Notes"],
            handoff_rows or [["No handoff rows", "", "", "", "", ""]],
            [
                1.45 * inch,
                1.25 * inch,
                1.45 * inch,
                0.85 * inch,
                2.8 * inch,
                1.55 * inch,
            ],
            styles,
        )
    )

    status_rows = _status_rows(snapshot)
    if status_rows:
        story.append(Spacer(1, 7))
        story.append(_paragraph("Status Breakdown", styles["section"]))
        story.append(
            _build_table(
                ["Status", "Orders", "Qty"],
                status_rows,
                [1.6 * inch, 0.6 * inch, 0.6 * inch],
                styles,
            )
        )

    doc.build(story)
    return buffer.getvalue()
