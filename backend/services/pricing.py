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


def _normalize_text(value: Any) -> str:
    return str(value or "").strip()


def _format_name_list(names: list[str]) -> str:
    if not names:
        return "selected items"
    if len(names) == 1:
        return names[0]
    if len(names) == 2:
        return f"{names[0]} or {names[1]}"
    return f"{', '.join(names[:-1])}, or {names[-1]}"


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
class ComboRequirementGroup:
    id: str
    name: str
    item_ids: tuple[str, ...]
    min_quantity: int


@dataclass(frozen=True)
class ComboDiscount:
    type: str
    amount_value: float
    applies_to: str
    target_group_id: Optional[str]


@dataclass(frozen=True)
class ComboDeal:
    id: str
    name: str
    enabled: bool
    sort_order: int
    requirement_groups: tuple[ComboRequirementGroup, ...]
    discount: ComboDiscount


@dataclass(frozen=True)
class ComboApplication:
    combo_id: str
    name: str
    sort_order: int
    consumed_quantities: tuple[tuple[str, int], ...]
    savings_cents: int
    discount_allocations: tuple[tuple[str, int], ...]
    discount_type: str
    discount_amount: float
    applies_to: str
    target_group_id: Optional[str]
    discount_scope_label: str
    preview_text: str
    tie_key: tuple[Any, ...]


def effective_minimum_order_quantity(
    item_id: str,
    base_minimum_order_quantity: int,
    combo_deals: Optional[Iterable[Any]],
) -> int:
    effective_minimum = max(1, int(base_minimum_order_quantity or 1))
    for combo in normalize_combo_deals(combo_deals):
        if not combo.enabled:
            continue
        for group in combo.requirement_groups:
            if item_id not in group.item_ids:
                continue
            effective_minimum = min(effective_minimum, group.min_quantity)
    return effective_minimum


def _normalize_requirement(raw: Any) -> ComboRequirement:
    if not isinstance(raw, dict):
        raise ValueError("Combo requirement must be an object")

    item_id = _normalize_text(raw.get("item_id"))
    if not item_id:
        raise ValueError("Combo requirement item_id is required")

    min_quantity = int(raw.get("min_quantity") or 0)
    if min_quantity < 1:
        raise ValueError("Combo requirement min_quantity must be at least 1")

    return ComboRequirement(item_id=item_id, min_quantity=min_quantity)


def _normalize_requirement_group(raw: Any, index: int) -> ComboRequirementGroup:
    if not isinstance(raw, dict):
        raise ValueError("Combo requirement group must be an object")

    group_id = _normalize_text(raw.get("id"))
    if not group_id:
        raise ValueError("Combo requirement group id is required")

    group_name = _normalize_text(raw.get("name")) or f"Group {index + 1}"
    item_ids_raw = raw.get("item_ids")
    if not isinstance(item_ids_raw, list) or len(item_ids_raw) == 0:
        raise ValueError(f"Combo requirement group '{group_name}' must include at least one item")

    item_ids = tuple(_normalize_text(item_id) for item_id in item_ids_raw if _normalize_text(item_id))
    if len(item_ids) != len(item_ids_raw):
        raise ValueError(f"Combo requirement group '{group_name}' contains an empty item id")
    if len(set(item_ids)) != len(item_ids):
        raise ValueError(f"Combo requirement group '{group_name}' cannot repeat items")

    min_quantity = int(raw.get("min_quantity") or 0)
    if min_quantity < 1:
        raise ValueError(f"Combo requirement group '{group_name}' min_quantity must be at least 1")

    return ComboRequirementGroup(
        id=group_id,
        name=group_name,
        item_ids=item_ids,
        min_quantity=min_quantity,
    )


def _legacy_requirements_to_groups(requirements_raw: Any) -> tuple[ComboRequirementGroup, ...]:
    if not isinstance(requirements_raw, list) or len(requirements_raw) == 0:
        return ()
    groups: list[ComboRequirementGroup] = []
    for index, entry in enumerate(requirements_raw):
        requirement = _normalize_requirement(entry)
        groups.append(
            ComboRequirementGroup(
                id=f"legacy-{index + 1}-{requirement.item_id}",
                name=requirement.item_id,
                item_ids=(requirement.item_id,),
                min_quantity=requirement.min_quantity,
            )
        )
    return tuple(groups)


def _group_item_label(group: ComboRequirementGroup, item_names: dict[str, str]) -> str:
    labels = [item_names.get(item_id, item_id) for item_id in group.item_ids]
    return _format_name_list(labels)


def _group_requirement_label(group: ComboRequirementGroup, item_names: dict[str, str]) -> str:
    return f"{group.min_quantity} x {_group_item_label(group, item_names)}"


def normalize_combo_deals(
    combo_deals: Optional[Iterable[Any]],
    *,
    allowed_item_ids: Optional[set[str]] = None,
) -> list[ComboDeal]:
    normalized: list[ComboDeal] = []
    seen_ids: set[str] = set()

    for index, raw in enumerate(combo_deals or []):
        if isinstance(raw, ComboDeal):
            combo_id = raw.id
            if combo_id in seen_ids:
                raise ValueError(f"Duplicate combo deal id: {combo_id}")
            seen_ids.add(combo_id)

            if allowed_item_ids is not None:
                combo_item_ids = {
                    item_id
                    for group in raw.requirement_groups
                    for item_id in group.item_ids
                }
                missing_item_ids = sorted(item_id for item_id in combo_item_ids if item_id not in allowed_item_ids)
                if missing_item_ids:
                    raise ValueError(
                        f"Combo deal '{raw.name}' references items not selected for the event: {', '.join(missing_item_ids)}"
                    )

            normalized.append(raw)
            continue

        if not isinstance(raw, dict):
            raise ValueError("Combo deal must be an object")

        combo_id = _normalize_text(raw.get("id"))
        if not combo_id:
            raise ValueError("Combo deal id is required")
        if combo_id in seen_ids:
            raise ValueError(f"Duplicate combo deal id: {combo_id}")
        seen_ids.add(combo_id)

        name = _normalize_text(raw.get("name"))
        if not name:
            raise ValueError("Combo deal name is required")

        requirement_groups_raw = raw.get("requirement_groups")
        if isinstance(requirement_groups_raw, list) and len(requirement_groups_raw) > 0:
            requirement_groups = tuple(
                _normalize_requirement_group(entry, group_index)
                for group_index, entry in enumerate(requirement_groups_raw)
            )
        else:
            requirement_groups = _legacy_requirements_to_groups(raw.get("requirements"))

        if not requirement_groups:
            raise ValueError(f"Combo deal '{name}' must include at least one requirement group")

        group_ids = [group.id for group in requirement_groups]
        if len(set(group_ids)) != len(group_ids):
            raise ValueError(f"Combo deal '{name}' cannot include duplicate requirement group ids")

        seen_group_items: set[str] = set()
        for group in requirement_groups:
            overlapping = seen_group_items.intersection(group.item_ids)
            if overlapping:
                overlap_copy = ", ".join(sorted(overlapping))
                raise ValueError(f"Combo deal '{name}' repeats items across groups: {overlap_copy}")
            seen_group_items.update(group.item_ids)

        if allowed_item_ids is not None:
            missing_item_ids = sorted(item_id for item_id in seen_group_items if item_id not in allowed_item_ids)
            if missing_item_ids:
                raise ValueError(
                    f"Combo deal '{name}' references items not selected for the event: {', '.join(missing_item_ids)}"
                )

        discount_raw = raw.get("discount")
        if not isinstance(discount_raw, dict):
            raise ValueError(f"Combo deal '{name}' discount is required")

        discount_type = _normalize_text(discount_raw.get("type"))
        if discount_type not in {"fixed_amount", "percentage"}:
            raise ValueError(f"Combo deal '{name}' discount.type must be 'fixed_amount' or 'percentage'")

        amount_value = round(float(discount_raw.get("amount") or 0), 2)
        if amount_value <= 0:
            raise ValueError(f"Combo deal '{name}' discount amount must be greater than 0")
        if discount_type == "percentage" and amount_value > 100:
            raise ValueError(f"Combo deal '{name}' percentage discounts cannot exceed 100")

        applies_to_raw = _normalize_text(discount_raw.get("applies_to"))
        if applies_to_raw not in {"combo_total", "item", "group"}:
            raise ValueError(f"Combo deal '{name}' discount.applies_to must be 'combo_total', 'item', or 'group'")

        target_group_id = _normalize_text(discount_raw.get("target_group_id")) or None
        target_item_id = _normalize_text(discount_raw.get("target_item_id")) or None

        if applies_to_raw == "group":
            if not target_group_id:
                raise ValueError(f"Combo deal '{name}' requires discount.target_group_id when applies_to is 'group'")
            if target_group_id not in group_ids:
                raise ValueError(f"Combo deal '{name}' target group must be one of its requirement groups")
            applies_to = "group"
        elif applies_to_raw == "item":
            if not target_item_id:
                raise ValueError(f"Combo deal '{name}' requires discount.target_item_id when applies_to is 'item'")
            target_group_id = next(
                (group.id for group in requirement_groups if target_item_id in group.item_ids),
                None,
            )
            if not target_group_id:
                raise ValueError(f"Combo deal '{name}' target item must belong to one of its requirement groups")
            applies_to = "group"
        else:
            target_group_id = None
            applies_to = "combo_total"

        normalized.append(
            ComboDeal(
                id=combo_id,
                name=name,
                enabled=bool(raw.get("enabled", True)),
                sort_order=int(raw.get("sort_order") or index),
                requirement_groups=requirement_groups,
                discount=ComboDiscount(
                    type=discount_type,
                    amount_value=amount_value,
                    applies_to=applies_to,
                    target_group_id=target_group_id,
                ),
            )
        )

    return normalized


def serialize_combo_deal(combo: ComboDeal) -> dict[str, Any]:
    return {
        "id": combo.id,
        "name": combo.name,
        "enabled": combo.enabled,
        "sort_order": combo.sort_order,
        "requirement_groups": [
            {
                "id": group.id,
                "name": group.name,
                "item_ids": list(group.item_ids),
                "min_quantity": group.min_quantity,
            }
            for group in combo.requirement_groups
        ],
        "discount": {
            "type": combo.discount.type,
            "amount": combo.discount.amount_value,
            "applies_to": combo.discount.applies_to,
            "target_group_id": combo.discount.target_group_id,
        },
    }


def serialize_combo_deals(combo_deals: Iterable[ComboDeal]) -> list[dict[str, Any]]:
    return [serialize_combo_deal(combo) for combo in combo_deals]


def format_currency(amount: float, currency: str) -> str:
    return f"{currency} ${amount:.2f}"


def combo_discount_scope_label(combo: ComboDeal, item_names: dict[str, str]) -> str:
    if combo.discount.applies_to == "combo_total":
        return "Whole combo"
    target_group = next(
        (group for group in combo.requirement_groups if group.id == combo.discount.target_group_id),
        None,
    )
    if target_group is None:
        return "Selected group"
    return _group_item_label(target_group, item_names)


def combo_preview_text(combo: ComboDeal, item_names: dict[str, str], currency: str) -> str:
    requirement_copy = ", ".join(
        _group_requirement_label(group, item_names)
        for group in combo.requirement_groups
    )
    if combo.discount.type == "fixed_amount":
        discount_amount = format_currency(combo.discount.amount_value, currency)
    else:
        normalized_percent = f"{combo.discount.amount_value:.2f}".rstrip("0").rstrip(".")
        discount_amount = f"{normalized_percent}%"
    if combo.discount.applies_to == "combo_total":
        return f"Buy {requirement_copy} and save {discount_amount} on the combo."
    return f"Buy {requirement_copy} and save {discount_amount} on {combo_discount_scope_label(combo, item_names)}."


def _group_consumption_total_cents(
    consumption: tuple[tuple[str, int], ...],
    prices_cents: dict[str, int],
) -> int:
    return sum(prices_cents[item_id] * quantity for item_id, quantity in consumption)


def _full_group_consumption(
    group: ComboRequirementGroup,
    state: tuple[int, ...],
    state_to_quantity: dict[str, int],
) -> tuple[tuple[str, int], ...]:
    return tuple(
        sorted(
            (
                item_id,
                state[state_to_quantity[item_id]],
            )
            for item_id in group.item_ids
            if state[state_to_quantity[item_id]] > 0
        )
    )


def _select_group_consumption(
    group: ComboRequirementGroup,
    state: tuple[int, ...],
    state_to_quantity: dict[str, int],
    prices_cents: dict[str, int],
    *,
    prefer_highest_prices: bool,
) -> tuple[tuple[str, int], ...]:
    if group.min_quantity < 1:
        return ()

    item_ids = sorted(
        group.item_ids,
        key=lambda item_id: (
            -prices_cents[item_id] if prefer_highest_prices else prices_cents[item_id],
            item_id,
        ),
    )
    remaining = group.min_quantity
    selected: list[tuple[str, int]] = []

    for item_id in item_ids:
        available = state[state_to_quantity[item_id]]
        if available <= 0:
            continue
        quantity = min(available, remaining)
        if quantity > 0:
            selected.append((item_id, quantity))
            remaining -= quantity
        if remaining == 0:
            break

    if remaining > 0:
        return ()
    return tuple(sorted(selected))


def _group_consumption_candidates(
    *,
    combo: ComboDeal,
    group: ComboRequirementGroup,
    state: tuple[int, ...],
    state_to_quantity: dict[str, int],
    prices_cents: dict[str, int],
) -> tuple[tuple[tuple[str, int], ...], ...]:
    if combo.discount.applies_to == "group" and group.id == combo.discount.target_group_id:
        full_consumption = _full_group_consumption(group, state, state_to_quantity)
        if sum(quantity for _, quantity in full_consumption) < group.min_quantity:
            return ()
        return (full_consumption,)

    cheapest = _select_group_consumption(
        group,
        state,
        state_to_quantity,
        prices_cents,
        prefer_highest_prices=False,
    )
    if not cheapest:
        return ()

    if combo.discount.applies_to == "group":
        return (cheapest,)

    priciest = _select_group_consumption(
        group,
        state,
        state_to_quantity,
        prices_cents,
        prefer_highest_prices=True,
    )
    if not priciest or priciest == cheapest:
        return (cheapest,)

    if combo.discount.type == "percentage":
        return (priciest, cheapest)
    return (cheapest, priciest)


def _allocate_discount_from_consumption(
    consumption: tuple[tuple[str, int], ...],
    prices_cents: dict[str, int],
    savings_cents: int,
) -> tuple[tuple[str, int], ...]:
    contributions = {
        item_id: prices_cents[item_id] * quantity
        for item_id, quantity in consumption
        if quantity > 0
    }
    total_cents = sum(contributions.values())
    if total_cents <= 0 or savings_cents <= 0:
        return ()

    allocations = {
        item_id: (savings_cents * value) // total_cents
        for item_id, value in contributions.items()
    }
    allocated = sum(allocations.values())
    remainder = savings_cents - allocated
    if remainder > 0:
        highest_item_id = sorted(
            contributions.keys(),
            key=lambda item_id: (-contributions[item_id], item_id),
        )[0]
        allocations[highest_item_id] += remainder
    return tuple(sorted((item_id, cents) for item_id, cents in allocations.items() if cents > 0))


def _build_combo_application(
    *,
    combo: ComboDeal,
    group_consumptions: tuple[tuple[str, tuple[tuple[str, int], ...]], ...],
    prices_cents: dict[str, int],
    item_names: dict[str, str],
    currency: str,
) -> Optional[ComboApplication]:
    consumed_quantities: list[tuple[str, int]] = []
    group_consumption_lookup = {group_id: consumption for group_id, consumption in group_consumptions}
    total_consumed_cents = 0
    for _, consumption in group_consumptions:
        consumed_quantities.extend(consumption)
        total_consumed_cents += _group_consumption_total_cents(consumption, prices_cents)

    if total_consumed_cents <= 0:
        return None

    if combo.discount.applies_to == "combo_total":
        applicable_consumption = tuple(sorted(consumed_quantities))
        applicable_total_cents = total_consumed_cents
    else:
        applicable_consumption = group_consumption_lookup.get(combo.discount.target_group_id or "", ())
        applicable_total_cents = _group_consumption_total_cents(applicable_consumption, prices_cents)

    if applicable_total_cents <= 0:
        return None

    if combo.discount.type == "fixed_amount":
        savings_cents = min(_to_cents(combo.discount.amount_value), applicable_total_cents)
    else:
        savings_cents = min(
            int(round(applicable_total_cents * combo.discount.amount_value / 100.0)),
            applicable_total_cents,
        )
    if savings_cents <= 0:
        return None

    preview_text = combo_preview_text(combo, item_names, currency)
    discount_scope_label = combo_discount_scope_label(combo, item_names)
    discount_allocations = _allocate_discount_from_consumption(applicable_consumption, prices_cents, savings_cents)
    consumed_quantities_tuple = tuple(sorted((item_id, quantity) for item_id, quantity in consumed_quantities if quantity > 0))
    preference_score = applicable_total_cents if combo.discount.applies_to == "group" else total_consumed_cents

    return ComboApplication(
        combo_id=combo.id,
        name=combo.name,
        sort_order=combo.sort_order,
        consumed_quantities=consumed_quantities_tuple,
        savings_cents=savings_cents,
        discount_allocations=discount_allocations,
        discount_type=combo.discount.type,
        discount_amount=combo.discount.amount_value,
        applies_to=combo.discount.applies_to,
        target_group_id=combo.discount.target_group_id,
        discount_scope_label=discount_scope_label,
        preview_text=preview_text,
        tie_key=(
            combo.sort_order,
            combo.name.lower(),
            combo.id,
            -preference_score,
            consumed_quantities_tuple,
        ),
    )


def _build_combo_applications_for_state(
    *,
    combo: ComboDeal,
    state: tuple[int, ...],
    state_to_quantity: dict[str, int],
    prices_cents: dict[str, int],
    item_names: dict[str, str],
    currency: str,
) -> tuple[ComboApplication, ...]:
    group_consumption_options: list[tuple[tuple[tuple[str, int], ...], ...]] = []
    for group in combo.requirement_groups:
        candidates = _group_consumption_candidates(
            combo=combo,
            group=group,
            state=state,
            state_to_quantity=state_to_quantity,
            prices_cents=prices_cents,
        )
        if not candidates:
            return ()
        group_consumption_options.append(candidates)

    applications_by_consumption: dict[tuple[tuple[str, int], ...], ComboApplication] = {}

    def collect(index: int, current: list[tuple[str, tuple[tuple[str, int], ...]]]) -> None:
        if index == len(group_consumption_options):
            application = _build_combo_application(
                combo=combo,
                group_consumptions=tuple(current),
                prices_cents=prices_cents,
                item_names=item_names,
                currency=currency,
            )
            if application is not None:
                applications_by_consumption.setdefault(application.consumed_quantities, application)
            return

        group = combo.requirement_groups[index]
        for consumption in group_consumption_options[index]:
            current.append((group.id, consumption))
            collect(index + 1, current)
            current.pop()

    collect(0, [])

    applications = list(applications_by_consumption.values())
    applications.sort(key=lambda application: (-application.savings_cents, application.tie_key))
    return tuple(applications)


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


def _preferred_upsell_item_id(
    *,
    group: ComboRequirementGroup,
    quantities_by_item: dict[str, int],
    prices_cents: dict[str, int],
    item_names: dict[str, str],
) -> str:
    return sorted(
        group.item_ids,
        key=lambda item_id: (
            -(1 if quantities_by_item.get(item_id, 0) > 0 else 0),
            -quantities_by_item.get(item_id, 0),
            -prices_cents[item_id],
            item_names.get(item_id, item_id).lower(),
            item_id,
        ),
    )[0]


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
        {
            item_id
            for combo in normalized_combo_deals
            for group in combo.requirement_groups
            for item_id in group.item_ids
        }
    )
    initial_state = tuple(quantities_by_item.get(item_id, 0) for item_id in combo_item_ids)
    state_to_quantity = {item_id: index for index, item_id in enumerate(combo_item_ids)}

    @lru_cache(maxsize=None)
    def combo_applications(combo_index: int, state: tuple[int, ...]) -> tuple[ComboApplication, ...]:
        return _build_combo_applications_for_state(
            combo=normalized_combo_deals[combo_index],
            state=state,
            state_to_quantity=state_to_quantity,
            prices_cents=price_cents_by_item,
            item_names=item_names,
            currency=currency,
        )

    @lru_cache(maxsize=None)
    def best_applications(
        state: tuple[int, ...]
    ) -> tuple[int, tuple[tuple[Any, ...], ...], tuple[ComboApplication, ...]]:
        best_savings = 0
        best_keys: tuple[tuple[Any, ...], ...] = ()
        best_selected: tuple[ComboApplication, ...] = ()

        for combo_index in range(len(normalized_combo_deals)):
            for application in combo_applications(combo_index, state):
                next_state = list(state)
                for item_id, quantity in application.consumed_quantities:
                    idx = state_to_quantity.get(item_id)
                    if idx is None or next_state[idx] < quantity:
                        break
                    next_state[idx] -= quantity
                else:
                    child_savings, child_keys, child_selected = best_applications(tuple(next_state))
                    total_savings = application.savings_cents + child_savings
                    candidate_keys = (application.tie_key,) + child_keys
                    candidate_selected = (application,) + child_selected
                    if total_savings > best_savings:
                        best_savings = total_savings
                        best_keys = candidate_keys
                        best_selected = candidate_selected
                    elif total_savings == best_savings and (not best_keys or candidate_keys < best_keys):
                        best_keys = candidate_keys
                        best_selected = candidate_selected

        return best_savings, best_keys, best_selected

    best_discount_cents, _, chosen_applications = best_applications(initial_state)

    remaining_quantities = dict(quantities_by_item)
    item_discount_cents: dict[str, int] = {item_id: 0 for item_id in quantities_by_item.keys()}
    grouped_applied_combos: dict[str, dict[str, Any]] = {}

    for application in chosen_applications:
        for item_id, quantity in application.consumed_quantities:
            remaining_quantities[item_id] = remaining_quantities.get(item_id, 0) - quantity
        for item_id, cents in application.discount_allocations:
            item_discount_cents[item_id] = item_discount_cents.get(item_id, 0) + cents

        current = grouped_applied_combos.setdefault(
            application.combo_id,
            {
                "combo_id": application.combo_id,
                "name": application.name,
                "application_count": 0,
                "savings_cents": 0,
                "preview_text": application.preview_text,
                "discount_type": application.discount_type,
                "discount_amount": application.discount_amount,
                "discount_scope_label": application.discount_scope_label,
            },
        )
        current["application_count"] += 1
        current["savings_cents"] += application.savings_cents

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
        current_state = tuple(quantities_by_item.get(item_id, 0) for item_id in combo_item_ids)
        for combo in normalized_combo_deals:
            current_candidates = _build_combo_applications_for_state(
                combo=combo,
                state=current_state,
                state_to_quantity=state_to_quantity,
                prices_cents=price_cents_by_item,
                item_names=item_names,
                currency=currency,
            )
            if current_candidates:
                continue

            missing_requirements: list[dict[str, Any]] = []
            matched_requirement_count = 0
            hypothetical_quantities = dict(quantities_by_item)

            for group in combo.requirement_groups:
                current_qty = sum(max(0, quantities_by_item.get(item_id, 0)) for item_id in group.item_ids)
                if current_qty > 0:
                    matched_requirement_count += 1
                missing_qty = max(0, group.min_quantity - current_qty)
                if missing_qty <= 0:
                    continue

                preferred_item_id = _preferred_upsell_item_id(
                    group=group,
                    quantities_by_item=quantities_by_item,
                    prices_cents=price_cents_by_item,
                    item_names=item_names,
                )
                hypothetical_quantities[preferred_item_id] = hypothetical_quantities.get(preferred_item_id, 0) + missing_qty
                missing_requirements.append(
                    {
                        "group_id": group.id,
                        "group_name": group.name,
                        "item_id": preferred_item_id,
                        "item_name": item_names.get(preferred_item_id, preferred_item_id),
                        "missing_quantity": missing_qty,
                    }
                )

            if not missing_requirements or matched_requirement_count == 0:
                continue

            hypothetical_state = tuple(hypothetical_quantities.get(item_id, 0) for item_id in combo_item_ids)
            candidates = _build_combo_applications_for_state(
                combo=combo,
                state=hypothetical_state,
                state_to_quantity=state_to_quantity,
                prices_cents=price_cents_by_item,
                item_names=item_names,
                currency=currency,
            )
            if not candidates:
                continue

            savings_cents = candidates[0].savings_cents
            missing_copy = ", ".join(
                f"{entry['missing_quantity']} more of {_group_item_label(next(group for group in combo.requirement_groups if group.id == entry['group_id']), item_names)}"
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
                "discount_type": entry["discount_type"],
                "discount_amount": entry["discount_amount"],
                "discount_scope_label": entry["discount_scope_label"],
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
