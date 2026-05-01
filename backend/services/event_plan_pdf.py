from __future__ import annotations

from collections import defaultdict
from io import BytesIO
from typing import Any

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import landscape, letter
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import Flowable, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle


FOREST = colors.HexColor("#12270F")
SAGE = colors.HexColor("#729152")
CREAM = colors.HexColor("#F7F5F0")
ACCENT = colors.HexColor("#F2AF29")
BORDER = colors.HexColor("#D8D4CC")
TEXT = colors.HexColor("#1C1C1A")
MUTED = colors.HexColor("#5A5A58")
WARNING = colors.HexColor("#92400E")
ERROR = colors.HexColor("#991B1B")


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
        "item_qty": ParagraphStyle(
            "item_qty",
            fontName="Helvetica-Bold",
            fontSize=14,
            leading=16,
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
    return Paragraph(_text(value).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;"), style)


def _active_rows(snapshot: dict[str, Any]) -> list[dict[str, Any]]:
    return [
        row for row in snapshot.get("planned_rows", [])
        if row.get("row_state", "active") == "active"
    ]


def _quantity_breakdown(snapshot: dict[str, Any]) -> list[dict[str, Any]]:
    grouped: dict[str, dict[str, dict[str, int]]] = defaultdict(lambda: defaultdict(lambda: defaultdict(int)))
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
                for item, quantity in sorted(items.items(), key=lambda entry: (-entry[1], entry[0]))
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
        grouped[key].append(f"{_text(row.get('planned_item_name'))} x{_quantity(row.get('quantity'))}")
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
        rows.append([_status_label(status), str(value.get("orders", 0)), str(value.get("quantity", 0))])
    return rows


def _summary_table(snapshot: dict[str, Any], styles: dict[str, ParagraphStyle]) -> Table:
    totals = snapshot.get("totals") or {}
    warnings = snapshot.get("warnings") or []
    data = [
        [_paragraph("Orders", styles["meta"]), _paragraph(str(totals.get("included_order_count", 0)), styles["center"])],
        [_paragraph("Ordered Qty", styles["meta"]), _paragraph(str(totals.get("ordered_quantity", 0)), styles["center"])],
        [_paragraph("Planned Qty", styles["meta"]), _paragraph(str(totals.get("planned_quantity", 0)), styles["center"])],
        [_paragraph("Warnings", styles["meta"]), _paragraph(str(len(warnings)), styles["center"])],
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


def _build_table(headers: list[str], rows: list[list[Any]], widths: list[float], styles: dict[str, ParagraphStyle]) -> Table:
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


class QuantityGraph(Flowable):
    def __init__(self, *, event_name: str, total_quantity: int, locations: list[dict[str, Any]], width: float = 9.55 * inch):
        super().__init__()
        self.event_name = event_name or "Event"
        self.total_quantity = total_quantity
        self.locations = locations
        self.width = width
        self.line_color = TEXT
        self.node_stroke = TEXT
        self.height = self._measure_height()

    def _branch_height(self, location: dict[str, Any]) -> float:
        height = 0.82 * inch
        for time_slot in location.get("time_slots", []):
            height += 0.78 * inch
            height += max(1, len(time_slot.get("items", []))) * 0.38 * inch
            height += 0.12 * inch
        return height

    def _measure_height(self) -> float:
        branch_height = max([self._branch_height(location) for location in self.locations] or [1.4 * inch])
        return 0.9 * inch + 0.42 * inch + branch_height + 0.16 * inch

    def wrap(self, availWidth: float, availHeight: float) -> tuple[float, float]:
        self.width = min(self.width, availWidth)
        self.height = self._measure_height()
        return self.width, self.height

    def _fit_text(self, text: Any, max_chars: int) -> str:
        value = _text(text)
        if len(value) <= max_chars:
            return value
        return value[: max_chars - 1].rstrip() + "."

    def _node(self, x: float, y: float, width: float, height: float, fill: colors.Color, title: str, qty: int, title_color: colors.Color = TEXT) -> None:
        canvas = self.canv
        canvas.setStrokeColor(self.node_stroke)
        canvas.setLineWidth(2.2)
        canvas.setFillColor(fill)
        canvas.roundRect(x, y, width, height, 8, fill=1, stroke=1)
        if height <= 0.4 * inch:
            canvas.setFillColor(title_color)
            canvas.setFont("Helvetica-Bold", 6.5)
            canvas.drawString(x + 7, y + (height / 2) - 2.5, self._fit_text(title, 20))
            canvas.setFillColor(TEXT if fill != FOREST else colors.white)
            canvas.setFont("Helvetica-Bold", 11)
            canvas.drawRightString(x + width - 7, y + (height / 2) - 3.5, str(qty))
            return
        canvas.setFillColor(title_color)
        canvas.setFont("Helvetica-Bold", 7)
        canvas.drawCentredString(x + width / 2, y + height - 13, self._fit_text(title, 24))
        canvas.setFillColor(TEXT if fill != FOREST else colors.white)
        canvas.setFont("Helvetica-Bold", 13 if height < 34 else 17)
        canvas.drawCentredString(x + width / 2, y + 8, str(qty))

    def _line(self, x1: float, y1: float, x2: float, y2: float) -> None:
        canvas = self.canv
        canvas.setStrokeColor(self.line_color)
        canvas.setLineWidth(2.2)
        canvas.line(x1, y1, x2, y2)

    def draw(self) -> None:
        canvas = self.canv
        canvas.saveState()

        event_w = 2.25 * inch
        event_h = 0.64 * inch
        event_x = (self.width - event_w) / 2
        event_y = self.height - event_h - 4
        self._node(event_x, event_y, event_w, event_h, FOREST, self.event_name, self.total_quantity, ACCENT)

        if not self.locations:
            canvas.restoreState()
            return

        count = len(self.locations)
        column_w = self.width / count
        centers = [(index * column_w) + (column_w / 2) for index in range(count)]
        trunk_y = event_y - 18
        event_center = event_x + event_w / 2
        self._line(event_center, event_y, event_center, trunk_y)
        if count > 1:
            self._line(centers[0], trunk_y, centers[-1], trunk_y)

        loc_w = min(1.75 * inch, column_w * 0.76)
        loc_h = 0.54 * inch
        time_w = min(1.58 * inch, column_w * 0.82)
        time_h = 0.36 * inch
        item_w = min(1.5 * inch, column_w * 0.8)
        item_h = 0.31 * inch
        loc_y = trunk_y - 16 - loc_h

        for center, location in zip(centers, self.locations):
            loc_x = center - loc_w / 2
            self._line(center, trunk_y, center, loc_y + loc_h)
            self._node(loc_x, loc_y, loc_w, loc_h, ACCENT, location["location"], int(location["quantity"]))

            cursor_y = loc_y - 20 - time_h
            for time_slot in location.get("time_slots", []):
                time_x = center - time_w / 2
                self._line(center, cursor_y + time_h + 20, center, cursor_y + time_h)
                self._node(time_x, cursor_y, time_w, time_h, SAGE, time_slot["time_slot"], int(time_slot["quantity"]), colors.white)
                item_cursor_y = cursor_y - 16 - item_h
                for item in time_slot.get("items", []):
                    item_x = center - item_w / 2
                    self._line(center, item_cursor_y + item_h + 16, center, item_cursor_y + item_h)
                    self._node(item_x, item_cursor_y, item_w, item_h, CREAM, item["item"], int(item["quantity"]))
                    item_cursor_y -= item_h + 5
                cursor_y = item_cursor_y - 8 - time_h

        canvas.restoreState()


def _quantity_graphs(snapshot: dict[str, Any]) -> list[Flowable]:
    locations = _quantity_breakdown(snapshot)
    if not locations:
        styles = _styles()
        return [_build_table(["Order Quantity Breakdown"], [["No planned rows"]], [9.35 * inch], styles)]
    source = snapshot.get("source_event") or {}
    totals = snapshot.get("totals") or {}
    event_name = _text(source.get("name")) or "Event"
    total_quantity = _quantity(totals.get("planned_quantity"))
    graph_locations = _split_quantity_graph_locations(locations)
    return [
        QuantityGraph(
            event_name=event_name,
            total_quantity=total_quantity,
            locations=graph_locations[index:index + 3],
        )
        for index in range(0, len(graph_locations), 3)
    ]


def _split_quantity_graph_locations(locations: list[dict[str, Any]], max_items_per_graph: int = 6) -> list[dict[str, Any]]:
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
                chunk = items[index:index + max_items_per_graph]
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


def build_event_plan_pdf(*, plan_name: str, status: str, snapshot: dict[str, Any]) -> bytes:
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
                    _paragraph(f"{_text(source.get('name'))} | {_text(source.get('event_date'))} | {_status_label(status)}", styles["meta"]),
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
    story.append(_paragraph("Order Quantity Breakdown", styles["section"]))
    for graph in _quantity_graphs(snapshot):
        story.append(graph)
        story.append(Spacer(1, 8))

    handoff_rows = [
        [entry["location"], entry["time_slot"], entry["customer"], entry["status"], entry["items"], entry["notes"]]
        for entry in _customer_rows(snapshot)
    ]
    story.append(Spacer(1, 7))
    story.append(_paragraph("Customer Handoff", styles["section"]))
    story.append(
        _build_table(
            ["Location", "Time", "Customer", "Status", "Items", "Notes"],
            handoff_rows or [["No handoff rows", "", "", "", "", ""]],
            [1.45 * inch, 1.25 * inch, 1.45 * inch, 0.85 * inch, 2.8 * inch, 1.55 * inch],
            styles,
        )
    )

    status_rows = _status_rows(snapshot)
    if status_rows:
        story.append(Spacer(1, 7))
        story.append(_paragraph("Status Breakdown", styles["section"]))
        story.append(_build_table(["Status", "Orders", "Qty"], status_rows, [1.6 * inch, 0.6 * inch, 0.6 * inch], styles))

    doc.build(story)
    return buffer.getvalue()
