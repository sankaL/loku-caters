import os
import sys
import unittest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from services.pricing import (
    PricingLineInput,
    effective_minimum_order_quantity,
    normalize_combo_deals,
    quote_cart,
)  # noqa: E402


ITEMS = [
    {
        "id": "lamprais",
        "name": "Lamprais",
        "price": 20.0,
        "discounted_price": None,
        "minimum_order_quantity": 1,
    },
    {
        "id": "roll",
        "name": "Egg Roll",
        "price": 3.0,
        "discounted_price": None,
        "minimum_order_quantity": 1,
    },
    {
        "id": "fish_roll",
        "name": "Fish Roll",
        "price": 3.0,
        "discounted_price": None,
        "minimum_order_quantity": 1,
    },
    {
        "id": "mutton_roll",
        "name": "Mutton Roll",
        "price": 4.0,
        "discounted_price": None,
        "minimum_order_quantity": 1,
    },
    {
        "id": "dessert",
        "name": "Watalappan",
        "price": 6.0,
        "discounted_price": 5.0,
        "minimum_order_quantity": 1,
    },
]


def price_cart(lines, combos):
    return quote_cart(
        items=ITEMS,
        combo_deals=combos,
        lines=lines,
        currency="CAD",
    )


class PricingTests(unittest.TestCase):
    def test_one_item_threshold_combo(self):
        result = price_cart(
            [PricingLineInput(line_id="lamprais", item_id="lamprais", quantity=5)],
            [
                {
                    "id": "lamprais-bulk",
                    "name": "Lamprais Bulk",
                    "enabled": True,
                    "sort_order": 0,
                    "requirements": [{"item_id": "lamprais", "min_quantity": 5}],
                    "discount": {
                        "type": "fixed_amount",
                        "amount": 5,
                        "applies_to": "combo_total",
                    },
                }
            ],
        )
        self.assertEqual(result["subtotal"], 100.0)
        self.assertEqual(result["discount_total"], 5.0)
        self.assertEqual(result["grand_total"], 95.0)

    def test_cross_item_combo(self):
        result = price_cart(
            [
                PricingLineInput(line_id="lamprais", item_id="lamprais", quantity=1),
                PricingLineInput(line_id="roll", item_id="roll", quantity=5),
            ],
            [
                {
                    "id": "combo-a",
                    "name": "Lamprais and Rolls",
                    "enabled": True,
                    "sort_order": 0,
                    "requirements": [
                        {"item_id": "lamprais", "min_quantity": 1},
                        {"item_id": "roll", "min_quantity": 5},
                    ],
                    "discount": {
                        "type": "fixed_amount",
                        "amount": 4,
                        "applies_to": "combo_total",
                    },
                }
            ],
        )
        self.assertEqual(result["subtotal"], 35.0)
        self.assertEqual(result["discount_total"], 4.0)
        self.assertEqual(result["grand_total"], 31.0)
        self.assertEqual(result["applied_combos"][0]["name"], "Lamprais and Rolls")

    def test_target_item_discount_uses_discounted_base_price(self):
        result = price_cart(
            [
                PricingLineInput(line_id="dessert", item_id="dessert", quantity=1),
                PricingLineInput(line_id="roll", item_id="roll", quantity=1),
            ],
            [
                {
                    "id": "dessert-pair",
                    "name": "Dessert Pairing",
                    "enabled": True,
                    "sort_order": 0,
                    "requirements": [
                        {"item_id": "dessert", "min_quantity": 1},
                        {"item_id": "roll", "min_quantity": 1},
                    ],
                    "discount": {
                        "type": "fixed_amount",
                        "amount": 2,
                        "applies_to": "item",
                        "target_item_id": "dessert",
                    },
                }
            ],
        )
        self.assertEqual(result["subtotal"], 8.0)
        self.assertEqual(result["discount_total"], 2.0)
        dessert_line = next(
            line for line in result["lines"] if line["item_id"] == "dessert"
        )
        self.assertEqual(dessert_line["discount_total"], 2.0)
        self.assertEqual(dessert_line["total_price"], 3.0)

    def test_repeatable_combo_applies_multiple_times(self):
        result = price_cart(
            [PricingLineInput(line_id="roll", item_id="roll", quantity=10)],
            [
                {
                    "id": "roll-pack",
                    "name": "Roll Pack",
                    "enabled": True,
                    "sort_order": 0,
                    "requirements": [{"item_id": "roll", "min_quantity": 5}],
                    "discount": {
                        "type": "fixed_amount",
                        "amount": 3,
                        "applies_to": "combo_total",
                    },
                }
            ],
        )
        self.assertEqual(result["discount_total"], 6.0)
        self.assertEqual(result["applied_combos"][0]["application_count"], 2)

    def test_maximum_public_quantity_handles_repeatable_unit_combo(self):
        result = price_cart(
            [PricingLineInput(line_id="roll", item_id="roll", quantity=250)],
            [
                {
                    "id": "single-roll",
                    "name": "Single Roll",
                    "enabled": True,
                    "sort_order": 0,
                    "requirements": [{"item_id": "roll", "min_quantity": 1}],
                    "discount": {
                        "type": "fixed_amount",
                        "amount": 0.01,
                        "applies_to": "combo_total",
                    },
                }
            ],
        )
        self.assertEqual(result["applied_combos"][0]["application_count"], 250)

    def test_percentage_combo_total_discount(self):
        result = price_cart(
            [
                PricingLineInput(line_id="lamprais", item_id="lamprais", quantity=1),
                PricingLineInput(line_id="roll", item_id="roll", quantity=5),
            ],
            [
                {
                    "id": "combo-percent",
                    "name": "Combo Percent",
                    "enabled": True,
                    "sort_order": 0,
                    "requirements": [
                        {"item_id": "lamprais", "min_quantity": 1},
                        {"item_id": "roll", "min_quantity": 5},
                    ],
                    "discount": {
                        "type": "percentage",
                        "amount": 10,
                        "applies_to": "combo_total",
                    },
                }
            ],
        )
        self.assertEqual(result["subtotal"], 35.0)
        self.assertEqual(result["discount_total"], 3.5)
        self.assertEqual(result["grand_total"], 31.5)

    def test_percentage_target_item_discount(self):
        result = price_cart(
            [
                PricingLineInput(line_id="dessert", item_id="dessert", quantity=1),
                PricingLineInput(line_id="roll", item_id="roll", quantity=1),
            ],
            [
                {
                    "id": "dessert-percent",
                    "name": "Dessert Percent",
                    "enabled": True,
                    "sort_order": 0,
                    "requirements": [
                        {"item_id": "dessert", "min_quantity": 1},
                        {"item_id": "roll", "min_quantity": 1},
                    ],
                    "discount": {
                        "type": "percentage",
                        "amount": 20,
                        "applies_to": "item",
                        "target_item_id": "dessert",
                    },
                }
            ],
        )
        self.assertEqual(result["subtotal"], 8.0)
        self.assertEqual(result["discount_total"], 1.0)
        dessert_line = next(
            line for line in result["lines"] if line["item_id"] == "dessert"
        )
        self.assertEqual(dessert_line["discount_total"], 1.0)
        self.assertEqual(dessert_line["total_price"], 4.0)

    def test_overlap_prefers_best_non_overlapping_solution(self):
        result = price_cart(
            [
                PricingLineInput(line_id="lamprais", item_id="lamprais", quantity=1),
                PricingLineInput(line_id="roll", item_id="roll", quantity=5),
                PricingLineInput(line_id="dessert", item_id="dessert", quantity=1),
            ],
            [
                {
                    "id": "lamprais-rolls",
                    "name": "Lamprais and Rolls",
                    "enabled": True,
                    "sort_order": 0,
                    "requirements": [
                        {"item_id": "lamprais", "min_quantity": 1},
                        {"item_id": "roll", "min_quantity": 5},
                    ],
                    "discount": {
                        "type": "fixed_amount",
                        "amount": 4,
                        "applies_to": "combo_total",
                    },
                },
                {
                    "id": "lamprais-dessert",
                    "name": "Lamprais and Dessert",
                    "enabled": True,
                    "sort_order": 1,
                    "requirements": [
                        {"item_id": "lamprais", "min_quantity": 1},
                        {"item_id": "dessert", "min_quantity": 1},
                    ],
                    "discount": {
                        "type": "fixed_amount",
                        "amount": 3,
                        "applies_to": "combo_total",
                    },
                },
            ],
        )
        self.assertEqual(result["discount_total"], 4.0)
        self.assertEqual(result["applied_combos"][0]["combo_id"], "lamprais-rolls")

    def test_discount_is_capped_by_target_item_total(self):
        result = price_cart(
            [PricingLineInput(line_id="roll", item_id="roll", quantity=1)],
            [
                {
                    "id": "free-roll",
                    "name": "Free Roll",
                    "enabled": True,
                    "sort_order": 0,
                    "requirements": [{"item_id": "roll", "min_quantity": 1}],
                    "discount": {
                        "type": "fixed_amount",
                        "amount": 10,
                        "applies_to": "item",
                        "target_item_id": "roll",
                    },
                }
            ],
        )
        self.assertEqual(result["subtotal"], 3.0)
        self.assertEqual(result["discount_total"], 3.0)
        self.assertEqual(result["grand_total"], 0.0)

    def test_grouped_or_combo_matches_any_item(self):
        result = price_cart(
            [
                PricingLineInput(line_id="lamprais", item_id="lamprais", quantity=10),
                PricingLineInput(
                    line_id="mutton-roll", item_id="mutton_roll", quantity=1
                ),
            ],
            [
                {
                    "id": "lamprais-roll-choice",
                    "name": "Lamprais + Roll Choice",
                    "enabled": True,
                    "sort_order": 0,
                    "requirement_groups": [
                        {
                            "id": "base",
                            "name": "Lamprais",
                            "item_ids": ["lamprais"],
                            "min_quantity": 10,
                        },
                        {
                            "id": "addon",
                            "name": "Roll Choice",
                            "item_ids": ["fish_roll", "mutton_roll"],
                            "min_quantity": 1,
                        },
                    ],
                    "discount": {
                        "type": "percentage",
                        "amount": 50,
                        "applies_to": "group",
                        "target_group_id": "addon",
                    },
                }
            ],
        )
        self.assertEqual(result["discount_total"], 2.0)
        self.assertEqual(
            result["applied_combos"][0]["discount_scope_label"],
            "Fish Roll or Mutton Roll",
        )

    def test_group_discount_scales_per_bundle(self):
        result = price_cart(
            [
                PricingLineInput(line_id="lamprais", item_id="lamprais", quantity=20),
                PricingLineInput(line_id="fish-roll", item_id="fish_roll", quantity=2),
            ],
            [
                {
                    "id": "bulk-rolls",
                    "name": "Bulk Rolls",
                    "enabled": True,
                    "sort_order": 0,
                    "requirement_groups": [
                        {
                            "id": "base",
                            "name": "Lamprais",
                            "item_ids": ["lamprais"],
                            "min_quantity": 10,
                        },
                        {
                            "id": "addon",
                            "name": "Roll Choice",
                            "item_ids": ["fish_roll", "mutton_roll"],
                            "min_quantity": 1,
                        },
                    ],
                    "discount": {
                        "type": "percentage",
                        "amount": 50,
                        "applies_to": "group",
                        "target_group_id": "addon",
                    },
                }
            ],
        )
        self.assertEqual(result["discount_total"], 3.0)
        self.assertEqual(result["applied_combos"][0]["application_count"], 1)

    def test_group_discount_prefers_highest_priced_item_in_group(self):
        result = price_cart(
            [
                PricingLineInput(line_id="lamprais", item_id="lamprais", quantity=10),
                PricingLineInput(line_id="fish-roll", item_id="fish_roll", quantity=1),
                PricingLineInput(
                    line_id="mutton-roll", item_id="mutton_roll", quantity=1
                ),
            ],
            [
                {
                    "id": "premium-roll",
                    "name": "Premium Roll",
                    "enabled": True,
                    "sort_order": 0,
                    "requirement_groups": [
                        {
                            "id": "base",
                            "name": "Lamprais",
                            "item_ids": ["lamprais"],
                            "min_quantity": 10,
                        },
                        {
                            "id": "addon",
                            "name": "Roll Choice",
                            "item_ids": ["fish_roll", "mutton_roll"],
                            "min_quantity": 1,
                        },
                    ],
                    "discount": {
                        "type": "percentage",
                        "amount": 50,
                        "applies_to": "group",
                        "target_group_id": "addon",
                    },
                }
            ],
        )
        self.assertEqual(result["discount_total"], 3.5)
        mutton_line = next(
            line for line in result["lines"] if line["item_id"] == "mutton_roll"
        )
        fish_line = next(
            line for line in result["lines"] if line["item_id"] == "fish_roll"
        )
        self.assertEqual(mutton_line["discount_total"], 2.0)
        self.assertEqual(fish_line["discount_total"], 1.5)

    def test_group_discount_applies_to_all_target_items_once_unlocked(self):
        result = price_cart(
            [
                PricingLineInput(line_id="lamprais", item_id="lamprais", quantity=1),
                PricingLineInput(
                    line_id="mutton-roll", item_id="mutton_roll", quantity=5
                ),
            ],
            [
                {
                    "id": "combo-all-apps",
                    "name": "Combo All Apps",
                    "enabled": True,
                    "sort_order": 0,
                    "requirement_groups": [
                        {
                            "id": "base",
                            "name": "Base group",
                            "item_ids": ["lamprais"],
                            "min_quantity": 1,
                        },
                        {
                            "id": "apps",
                            "name": "Apps",
                            "item_ids": ["fish_roll", "mutton_roll"],
                            "min_quantity": 1,
                        },
                    ],
                    "discount": {
                        "type": "percentage",
                        "amount": 50,
                        "applies_to": "group",
                        "target_group_id": "apps",
                    },
                }
            ],
        )
        self.assertEqual(result["discount_total"], 10.0)
        self.assertEqual(result["applied_combos"][0]["application_count"], 1)
        self.assertEqual(result["upsell_opportunities"], [])
        mutton_line = next(
            line for line in result["lines"] if line["item_id"] == "mutton_roll"
        )
        self.assertEqual(mutton_line["discount_total"], 10.0)

    def test_grouped_overlap_prefers_best_non_overlapping_solution(self):
        result = price_cart(
            [
                PricingLineInput(line_id="lamprais", item_id="lamprais", quantity=10),
                PricingLineInput(line_id="fish-roll", item_id="fish_roll", quantity=1),
                PricingLineInput(line_id="dessert", item_id="dessert", quantity=1),
            ],
            [
                {
                    "id": "lamprais-roll-choice",
                    "name": "Lamprais + Roll Choice",
                    "enabled": True,
                    "sort_order": 0,
                    "requirement_groups": [
                        {
                            "id": "base",
                            "name": "Lamprais",
                            "item_ids": ["lamprais"],
                            "min_quantity": 10,
                        },
                        {
                            "id": "addon",
                            "name": "Roll Choice",
                            "item_ids": ["fish_roll", "mutton_roll"],
                            "min_quantity": 1,
                        },
                    ],
                    "discount": {
                        "type": "fixed_amount",
                        "amount": 2,
                        "applies_to": "combo_total",
                    },
                },
                {
                    "id": "lamprais-dessert",
                    "name": "Lamprais + Dessert",
                    "enabled": True,
                    "sort_order": 1,
                    "requirement_groups": [
                        {
                            "id": "base",
                            "name": "Lamprais",
                            "item_ids": ["lamprais"],
                            "min_quantity": 10,
                        },
                        {
                            "id": "dessert",
                            "name": "Dessert",
                            "item_ids": ["dessert"],
                            "min_quantity": 1,
                        },
                    ],
                    "discount": {
                        "type": "fixed_amount",
                        "amount": 3,
                        "applies_to": "combo_total",
                    },
                },
            ],
        )
        self.assertEqual(result["discount_total"], 3.0)
        self.assertEqual(result["applied_combos"][0]["combo_id"], "lamprais-dessert")

    def test_grouped_combo_upsell_message_mentions_or_options(self):
        result = price_cart(
            [PricingLineInput(line_id="lamprais", item_id="lamprais", quantity=10)],
            [
                {
                    "id": "lamprais-roll-choice",
                    "name": "Lamprais + Roll Choice",
                    "enabled": True,
                    "sort_order": 0,
                    "requirement_groups": [
                        {
                            "id": "base",
                            "name": "Lamprais",
                            "item_ids": ["lamprais"],
                            "min_quantity": 10,
                        },
                        {
                            "id": "addon",
                            "name": "Roll Choice",
                            "item_ids": ["fish_roll", "mutton_roll"],
                            "min_quantity": 1,
                        },
                    ],
                    "discount": {
                        "type": "percentage",
                        "amount": 50,
                        "applies_to": "group",
                        "target_group_id": "addon",
                    },
                }
            ],
        )
        self.assertEqual(len(result["upsell_opportunities"]), 1)
        self.assertIn(
            "Fish Roll or Mutton Roll",
            result["upsell_opportunities"][0]["preview_text"],
        )
        self.assertIn(
            "Fish Roll or Mutton Roll", result["upsell_opportunities"][0]["message"]
        )
        missing_requirement = result["upsell_opportunities"][0]["missing_requirements"][
            0
        ]
        self.assertEqual(missing_requirement["group_min_quantity"], 1)
        self.assertEqual(
            missing_requirement["options"],
            [
                {
                    "item_id": "fish_roll",
                    "item_name": "Fish Roll",
                    "missing_quantity": 1,
                    "group_min_quantity": 1,
                },
                {
                    "item_id": "mutton_roll",
                    "item_name": "Mutton Roll",
                    "missing_quantity": 1,
                    "group_min_quantity": 1,
                },
            ],
        )

    def test_effective_minimum_order_quantity_uses_lowest_enabled_combo_group_minimum(
        self,
    ):
        effective_minimum = effective_minimum_order_quantity(
            "fish_roll",
            10,
            [
                {
                    "id": "combo-min",
                    "name": "Combo Minimum",
                    "enabled": True,
                    "sort_order": 0,
                    "requirement_groups": [
                        {
                            "id": "base",
                            "name": "Base",
                            "item_ids": ["lamprais"],
                            "min_quantity": 1,
                        },
                        {
                            "id": "apps",
                            "name": "Apps",
                            "item_ids": ["fish_roll", "mutton_roll"],
                            "min_quantity": 5,
                        },
                    ],
                    "discount": {
                        "type": "percentage",
                        "amount": 50,
                        "applies_to": "group",
                        "target_group_id": "apps",
                    },
                }
            ],
        )
        self.assertEqual(effective_minimum, 5)

    def test_quote_cart_accepts_pre_normalized_combo_deals(self):
        normalized_combo_deals = normalize_combo_deals(
            [
                {
                    "id": "lamprais-roll-choice",
                    "name": "Lamprais + Roll Choice",
                    "enabled": True,
                    "sort_order": 0,
                    "requirement_groups": [
                        {
                            "id": "base",
                            "name": "Lamprais",
                            "item_ids": ["lamprais"],
                            "min_quantity": 10,
                        },
                        {
                            "id": "addon",
                            "name": "Roll Choice",
                            "item_ids": ["fish_roll", "mutton_roll"],
                            "min_quantity": 1,
                        },
                    ],
                    "discount": {
                        "type": "percentage",
                        "amount": 50,
                        "applies_to": "group",
                        "target_group_id": "addon",
                    },
                }
            ],
            allowed_item_ids={item["id"] for item in ITEMS},
        )

        result = price_cart(
            [
                PricingLineInput(line_id="lamprais", item_id="lamprais", quantity=10),
                PricingLineInput(
                    line_id="mutton-roll", item_id="mutton_roll", quantity=1
                ),
            ],
            normalized_combo_deals,
        )

        self.assertEqual(result["discount_total"], 2.0)
        self.assertEqual(
            effective_minimum_order_quantity("mutton_roll", 10, normalized_combo_deals),
            1,
        )


if __name__ == "__main__":
    unittest.main()
