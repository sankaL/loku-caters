from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache
from typing import Any, Iterable, Optional


def _to_cents(value: Any) -> int:
    return int(round(float(value or 0) * 100))


def cents_to_amount(cents: int) -> float:
    return round(cents / 100.0, 2)


def effective_item_price_cents(item: dict[str, Any]) -> int:
    discounted = item.get("discounted_price")
    if discounted is not None:
        return _to_cents(discounted)
    return _to_cents(item.get("price"))


@dataclass(frozen=True)
class PricingLineInput:
    line_id: str
    item_id: str
    quantity: int


@dataclass(frozen=True)
class ComboRequirement:
    item_id: str
    min_quantity: int


@dataclass(frozen=True)
class ComboDiscount:
    type: str
    amount_cents: int
    applies_to: str
    target_item_id: Optional[str]


@dataclass(frozen=True)
class ComboDeal:
    id: str
    name: str
    enabled: bool
    sort_order: int
    requirements: tuple[ComboRequirement, ...]
    discount: ComboDiscount


@dataclass(frozen=True)
class ComboApplication:
    combo_id: str
    name: str
    sort_order: int
    requirements: tuple[ComboRequirement, ...]
    savings_cents: int
    discount_type: str
    applies_to: str
    target_item_id: Optional[str]


def _normalize_requirement(raw: Any) -> ComboRequirement:
    if not isinstance(raw, dict):
        raise ValueError("Combo requirement must be an object")

    item_id = str(raw.get("item_id") or "").strip()
    if not item_id:
        raise ValueError("Combo requirement item_id is required")

    min_quantity = int(raw.get("min_quantity") or 0)
    if min_quantity < 1:
        raise ValueError("Combo requirement min_quantity must be at least 1")

    return ComboRequirement(item_id=item_id, min_quantity=min_quantity)


def normalize_combo_deals(
    combo_deals: Optional[Iterable[Any]],
    *,
    allowed_item_ids: Optional[set[str]] = None,
) -> list[ComboDeal]:
    normalized: list[ComboDeal] = []
    seen_ids: set[str] = set()

    for index, raw in enumerate(combo_deals or []):
        if not isinstance(raw, dict):
            raise ValueError("Combo deal must be an object")

        combo_id = str(raw.get("id") or "").strip()
        if not combo_id:
            raise ValueError("Combo deal id is required")
        if combo_id in seen_ids:
            raise ValueError(f"Duplicate combo deal id: {combo_id}")
        seen_ids.add(combo_id)

        name = str(raw.get("name") or "").strip()
        if not name:
            raise ValueError("Combo deal name is required")

        requirements_raw = raw.get("requirements")
        if not isinstance(requirements_raw, list) or len(requirements_raw) == 0:
            raise ValueError(f"Combo deal '{name}' must include at least one requirement")

        requirements = tuple(_normalize_requirement(entry) for entry in requirements_raw)
        requirement_item_ids = [entry.item_id for entry in requirements]
        if len(set(requirement_item_ids)) != len(requirement_item_ids):
            raise ValueError(f"Combo deal '{name}' cannot include the same item more than once")

        if allowed_item_ids is not None:
            missing_item_ids = [item_id for item_id in requirement_item_ids if item_id not in allowed_item_ids]
            if missing_item_ids:
                raise ValueError(
                    f"Combo deal '{name}' references items not selected for the event: {', '.join(sorted(missing_item_ids))}"
                )

        discount_raw = raw.get("discount")
        if not isinstance(discount_raw, dict):
            raise ValueError(f"Combo deal '{name}' discount is required")

        discount_type = str(discount_raw.get("type") or "").strip()
        if discount_type != "fixed_amount":
            raise ValueError(f"Combo deal '{name}' discount.type must be 'fixed_amount'")

        amount_cents = _to_cents(discount_raw.get("amount"))
        if amount_cents <= 0:
            raise ValueError(f"Combo deal '{name}' discount amount must be greater than 0")

        applies_to = str(discount_raw.get("applies_to") or "").strip()
        if applies_to not in {"combo_total", "item"}:
            raise ValueError(f"Combo deal '{name}' discount.applies_to must be 'combo_total' or 'item'")

        target_item_id = discount_raw.get("target_item_id")
        target_item_id = str(target_item_id).strip() if target_item_id is not None else None
        if applies_to == "item":
            if not target_item_id:
                raise ValueError(f"Combo deal '{name}' requires discount.target_item_id when applies_to is 'item'")
            if target_item_id not in requirement_item_ids:
                raise ValueError(f"Combo deal '{name}' target item must be one of its requirements")
        else:
            target_item_id = None

        if allowed_item_ids is not None and target_item_id and target_item_id not in allowed_item_ids:
            raise ValueError(f"Combo deal '{name}' target item is not selected for the event")

        normalized.append(
            ComboDeal(
                id=combo_id,
                name=name,
                enabled=bool(raw.get("enabled", True)),
                sort_order=int(raw.get("sort_order") or index),
                requirements=requirements,
                discount=ComboDiscount(
                    type=discount_type,
                    amount_cents=amount_cents,
                    applies_to=applies_to,
                    target_item_id=target_item_id,
                ),
            )
        )

    return normalized


def combo_preview_text(combo: ComboDeal, item_names: dict[str, str], currency: str) -> str:
    requirement_copy = ", ".join(
        f"{req.min_quantity} x {item_names.get(req.item_id, req.item_id)}"
        for req in combo.requirements
    )
    discount_amount = format_currency(cents_to_amount(combo.discount.amount_cents), currency)
    if combo.discount.applies_to == "combo_total":
        return f"Buy {requirement_copy} and save {discount_amount} on the combo."
    target_name = item_names.get(combo.discount.target_item_id or "", combo.discount.target_item_id or "selected item")
    return f"Buy {requirement_copy} and save {discount_amount} on {target_name}."


def format_currency(amount: float, currency: str) -> str:
    return f"{currency} ${amount:.2f}"


def _application_savings_cents(combo: ComboDeal, prices_cents: dict[str, int]) -> int:
    if combo.discount.applies_to == "combo_total":
        combo_total_cents = sum(prices_cents[req.item_id] * req.min_quantity for req in combo.requirements)
        return min(combo.discount.amount_cents, combo_total_cents)

    target_item_id = combo.discount.target_item_id or ""
    target_requirement = next((req for req in combo.requirements if req.item_id == target_item_id), None)
    if target_requirement is None:
        return 0
    target_total_cents = prices_cents[target_item_id] * target_requirement.min_quantity
    return min(combo.discount.amount_cents, target_total_cents)


def _allocate_combo_total_discount(
    combo: ComboDeal,
    prices_cents: dict[str, int],
    savings_cents: int,
) -> dict[str, int]:
    contributions = {
        req.item_id: prices_cents[req.item_id] * req.min_quantity
        for req in combo.requirements
    }
    total_cents = sum(contributions.values())
    if total_cents <= 0 or savings_cents <= 0:
        return {}

    allocations = {item_id: (savings_cents * value) // total_cents for item_id, value in contributions.items()}
    allocated = sum(allocations.values())
    remainder = savings_cents - allocated
    if remainder > 0:
        highest_item_id = sorted(
            contributions.keys(),
            key=lambda item_id: (-contributions[item_id], item_id),
        )[0]
        allocations[highest_item_id] += remainder
    return allocations


def _allocate_item_discount(combo: ComboDeal, savings_cents: int) -> dict[str, int]:
    if savings_cents <= 0 or not combo.discount.target_item_id:
        return {}
    return {combo.discount.target_item_id: savings_cents}


def _allocate_line_discounts(
    lines: list[PricingLineInput],
    base_totals_cents_by_line: dict[str, int],
    item_discounts_cents: dict[str, int],
) -> dict[str, int]:
    line_discounts: dict[str, int] = {line.line_id: 0 for line in lines}
    lines_by_item: dict[str, list[PricingLineInput]] = {}
    for line in lines:
        lines_by_item.setdefault(line.item_id, []).append(line)

    for item_id, discount_cents in item_discounts_cents.items():
        item_lines = lines_by_item.get(item_id, [])
        if not item_lines or discount_cents <= 0:
            continue

        item_total_cents = sum(base_totals_cents_by_line[line.line_id] for line in item_lines)
        if item_total_cents <= 0:
            continue

        allocated = 0
        for line in item_lines:
            share = (discount_cents * base_totals_cents_by_line[line.line_id]) // item_total_cents
            share = min(share, base_totals_cents_by_line[line.line_id])
            line_discounts[line.line_id] += share
            allocated += share

        remainder = min(discount_cents - allocated, item_total_cents - allocated)
        if remainder > 0:
            highest_line = sorted(
                item_lines,
                key=lambda line: (-base_totals_cents_by_line[line.line_id], line.line_id),
            )[0]
            line_discounts[highest_line.line_id] += remainder

    for line in lines:
        line_discounts[line.line_id] = min(line_discounts[line.line_id], base_totals_cents_by_line[line.line_id])
    return line_discounts


def quote_cart(
    *,
    items: list[dict[str, Any]],
    combo_deals: Optional[Iterable[Any]],
    lines: list[PricingLineInput],
    currency: str,
) -> dict[str, Any]:
    item_lookup = {str(item["id"]): item for item in items}
    price_cents_by_item = {item_id: effective_item_price_cents(item) for item_id, item in item_lookup.items()}
    item_names = {item_id: str(item.get("name") or item_id) for item_id, item in item_lookup.items()}

    normalized_lines: list[PricingLineInput] = []
    for line in lines:
        item_id = str(line.item_id).strip()
        if item_id not in item_lookup:
            raise ValueError(f"Unknown item: {item_id}")
        quantity = int(line.quantity)
        if quantity < 1:
            raise ValueError(f"Quantity must be at least 1 for item {item_id}")
        normalized_lines.append(PricingLineInput(line_id=str(line.line_id), item_id=item_id, quantity=quantity))

    normalized_combo_deals = [
        combo
        for combo in normalize_combo_deals(combo_deals, allowed_item_ids=set(item_lookup.keys()))
        if combo.enabled
    ]
    normalized_combo_deals.sort(key=lambda combo: (combo.sort_order, combo.name.lower(), combo.id))

    quantities_by_item: dict[str, int] = {}
    for line in normalized_lines:
        quantities_by_item[line.item_id] = quantities_by_item.get(line.item_id, 0) + line.quantity

    combo_item_ids = sorted(
        {requirement.item_id for combo in normalized_combo_deals for requirement in combo.requirements}
    )
    initial_state = tuple(quantities_by_item.get(item_id, 0) for item_id in combo_item_ids)
    state_to_quantity = {item_id: index for index, item_id in enumerate(combo_item_ids)}

    application_templates: list[ComboApplication] = []
    for combo in normalized_combo_deals:
        savings_cents = _application_savings_cents(combo, price_cents_by_item)
        if savings_cents <= 0:
            continue
        application_templates.append(
            ComboApplication(
                combo_id=combo.id,
                name=combo.name,
                sort_order=combo.sort_order,
                requirements=combo.requirements,
                savings_cents=savings_cents,
                discount_type=combo.discount.type,
                applies_to=combo.discount.applies_to,
                target_item_id=combo.discount.target_item_id,
            )
        )

    @lru_cache(maxsize=None)
    def best_applications(state: tuple[int, ...]) -> tuple[int, tuple[int, ...]]:
        best_savings = 0
        best_combo_indexes: tuple[int, ...] = ()
        for combo_index, application in enumerate(application_templates):
            can_apply = True
            next_state = list(state)
            for requirement in application.requirements:
                idx = state_to_quantity.get(requirement.item_id)
                if idx is None or state[idx] < requirement.min_quantity:
                    can_apply = False
                    break
                next_state[idx] -= requirement.min_quantity
            if not can_apply:
                continue

            child_savings, child_indexes = best_applications(tuple(next_state))
            total_savings = application.savings_cents + child_savings
            candidate_indexes = (combo_index,) + child_indexes
            if total_savings > best_savings:
                best_savings = total_savings
                best_combo_indexes = candidate_indexes
            elif total_savings == best_savings and candidate_indexes < best_combo_indexes:
                best_combo_indexes = candidate_indexes
        return best_savings, best_combo_indexes

    best_discount_cents, chosen_indexes = best_applications(initial_state)
    chosen_applications = [application_templates[index] for index in chosen_indexes]

    remaining_quantities = dict(quantities_by_item)
    item_discount_cents: dict[str, int] = {item_id: 0 for item_id in quantities_by_item.keys()}
    grouped_applied_combos: dict[str, dict[str, Any]] = {}

    for application in chosen_applications:
        for requirement in application.requirements:
            remaining_quantities[requirement.item_id] = remaining_quantities.get(requirement.item_id, 0) - requirement.min_quantity
        if application.applies_to == "combo_total":
            allocations = _allocate_combo_total_discount(
                ComboDeal(
                    id=application.combo_id,
                    name=application.name,
                    enabled=True,
                    sort_order=application.sort_order,
                    requirements=application.requirements,
                    discount=ComboDiscount(
                        type=application.discount_type,
                        amount_cents=application.savings_cents,
                        applies_to=application.applies_to,
                        target_item_id=application.target_item_id,
                    ),
                ),
                price_cents_by_item,
                application.savings_cents,
            )
        else:
            allocations = _allocate_item_discount(
                ComboDeal(
                    id=application.combo_id,
                    name=application.name,
                    enabled=True,
                    sort_order=application.sort_order,
                    requirements=application.requirements,
                    discount=ComboDiscount(
                        type=application.discount_type,
                        amount_cents=application.savings_cents,
                        applies_to=application.applies_to,
                        target_item_id=application.target_item_id,
                    ),
                ),
                application.savings_cents,
            )
        for item_id, cents in allocations.items():
            item_discount_cents[item_id] = item_discount_cents.get(item_id, 0) + cents

        current = grouped_applied_combos.setdefault(
            application.combo_id,
            {
                "combo_id": application.combo_id,
                "name": application.name,
                "application_count": 0,
                "savings_cents": 0,
                "preview_text": "",
            },
        )
        current["application_count"] += 1
        current["savings_cents"] += application.savings_cents

    combo_lookup = {combo.id: combo for combo in normalized_combo_deals}
    for combo_id, current in grouped_applied_combos.items():
        combo = combo_lookup[combo_id]
        current["preview_text"] = combo_preview_text(combo, item_names, currency)

    base_totals_cents_by_line = {
        line.line_id: price_cents_by_item[line.item_id] * line.quantity
        for line in normalized_lines
    }
    line_discounts_cents = _allocate_line_discounts(normalized_lines, base_totals_cents_by_line, item_discount_cents)

    line_results: list[dict[str, Any]] = []
    subtotal_cents = 0
    for line in normalized_lines:
        base_total_cents = base_totals_cents_by_line[line.line_id]
        discount_cents = min(line_discounts_cents.get(line.line_id, 0), base_total_cents)
        final_total_cents = base_total_cents - discount_cents
        subtotal_cents += base_total_cents
        line_results.append(
            {
                "line_id": line.line_id,
                "item_id": line.item_id,
                "item_name": item_names.get(line.item_id, line.item_id),
                "quantity": line.quantity,
                "unit_price": cents_to_amount(price_cents_by_item[line.item_id]),
                "base_total": cents_to_amount(base_total_cents),
                "discount_total": cents_to_amount(discount_cents),
                "total_price": cents_to_amount(final_total_cents),
                "applied_combo_ids": sorted(
                    combo_id for combo_id, combo in grouped_applied_combos.items() if combo["savings_cents"] > 0
                ),
            }
        )

    opportunities: list[dict[str, Any]] = []
    if sum(quantities_by_item.values()) > 0:
        for combo in normalized_combo_deals:
            missing_requirements: list[dict[str, Any]] = []
            matched_requirement_count = 0
            for requirement in combo.requirements:
                current_qty = remaining_quantities.get(requirement.item_id, 0)
                if current_qty > 0:
                    matched_requirement_count += 1
                missing_qty = max(0, requirement.min_quantity - current_qty)
                if missing_qty > 0:
                    missing_requirements.append(
                        {
                            "item_id": requirement.item_id,
                            "item_name": item_names.get(requirement.item_id, requirement.item_id),
                            "missing_quantity": missing_qty,
                        }
                    )
            if not missing_requirements or matched_requirement_count == 0:
                continue

            savings_cents = _application_savings_cents(combo, price_cents_by_item)
            if savings_cents <= 0:
                continue
            missing_copy = ", ".join(
                f"{entry['missing_quantity']} more {entry['item_name']}"
                for entry in missing_requirements
            )
            opportunities.append(
                {
                    "combo_id": combo.id,
                    "name": combo.name,
                    "preview_text": combo_preview_text(combo, item_names, currency),
                    "message": f"Add {missing_copy} to save {format_currency(cents_to_amount(savings_cents), currency)}.",
                    "potential_savings": cents_to_amount(savings_cents),
                    "missing_requirements": missing_requirements,
                }
            )

    opportunities.sort(
        key=lambda entry: (
            -_to_cents(entry["potential_savings"]),
            sum(item["missing_quantity"] for item in entry["missing_requirements"]),
            entry["name"].lower(),
        )
    )

    applied_combos = sorted(
        (
            {
                "combo_id": combo_id,
                "name": entry["name"],
                "application_count": entry["application_count"],
                "savings_total": cents_to_amount(entry["savings_cents"]),
                "preview_text": entry["preview_text"],
            }
            for combo_id, entry in grouped_applied_combos.items()
        ),
        key=lambda entry: (-_to_cents(entry["savings_total"]), entry["name"].lower(), entry["combo_id"]),
    )

    return {
        "currency": currency,
        "lines": line_results,
        "subtotal": cents_to_amount(subtotal_cents),
        "discount_total": cents_to_amount(best_discount_cents),
        "grand_total": cents_to_amount(max(0, subtotal_cents - best_discount_cents)),
        "applied_combos": applied_combos,
        "upsell_opportunities": opportunities,
    }
