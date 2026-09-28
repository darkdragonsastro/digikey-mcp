import { describe, expect, it } from "vitest";
import {
  categoryChildren,
  filterManufacturers,
  page,
  searchCategories,
  type Category,
} from "../src/lookup.js";

const tree: Category[] = [
  {
    CategoryId: 3,
    Name: "Capacitors",
    ProductCount: 100,
    Children: [
      {
        CategoryId: 58,
        Name: "Aluminum Electrolytic Capacitors",
        ProductCount: 60,
        Children: [{ CategoryId: 900, Name: "Snap-In Capacitors", ProductCount: 5, Children: [] }],
      },
      { CategoryId: 60, Name: "Ceramic Capacitors", ProductCount: 40, Children: [] },
    ],
  },
  {
    CategoryId: 2,
    Name: "Resistors",
    ProductCount: 50,
    Children: [{ CategoryId: 52, Name: "Chip Resistor - Surface Mount", ProductCount: 50 }],
  },
];

describe("filterManufacturers", () => {
  const list = [
    { Id: 1, Name: "Würth Elektronik" },
    { Id: 2, Name: "Weidmüller" },
    { Id: 3, Name: "Texas Instruments" },
  ];

  it("matches ignoring case and accents", () => {
    expect(filterManufacturers(list, "WURTH").map((m) => m.Id)).toEqual([1]);
    expect(filterManufacturers(list, "weidmüller").map((m) => m.Id)).toEqual([2]);
  });

  it("returns everything when no name is given", () => {
    expect(filterManufacturers(list, undefined)).toHaveLength(3);
  });
});

describe("page", () => {
  it("returns the slice and the total before paging", () => {
    expect(page([1, 2, 3, 4, 5], 1, 2)).toEqual({ total: 5, offset: 1, limit: 2, items: [2, 3] });
  });
});

describe("searchCategories", () => {
  it("finds matches at any depth with their full path", () => {
    expect(searchCategories(tree, "capacitors")).toEqual([
      { CategoryId: 3, Name: "Capacitors", ProductCount: 100, ChildCount: 2, Path: "Capacitors" },
      {
        CategoryId: 58,
        Name: "Aluminum Electrolytic Capacitors",
        ProductCount: 60,
        ChildCount: 1,
        Path: "Capacitors > Aluminum Electrolytic Capacitors",
      },
      {
        CategoryId: 900,
        Name: "Snap-In Capacitors",
        ProductCount: 5,
        ChildCount: 0,
        Path: "Capacitors > Aluminum Electrolytic Capacitors > Snap-In Capacitors",
      },
      {
        CategoryId: 60,
        Name: "Ceramic Capacitors",
        ProductCount: 40,
        ChildCount: 0,
        Path: "Capacitors > Ceramic Capacitors",
      },
    ]);
  });

  it("searches only under the given category", () => {
    expect(searchCategories(tree, "capacitors", 58).map((c) => c.CategoryId)).toEqual([900]);
  });
});

describe("categoryChildren", () => {
  it("finds a nested category and lists its direct children without grandchildren", () => {
    expect(categoryChildren(tree, 58)).toEqual({
      category: {
        CategoryId: 58,
        Name: "Aluminum Electrolytic Capacitors",
        ProductCount: 60,
        ChildCount: 1,
        Path: "Capacitors > Aluminum Electrolytic Capacitors",
      },
      children: [{ CategoryId: 900, Name: "Snap-In Capacitors", ProductCount: 5, ChildCount: 0 }],
    });
  });

  it("throws for an unknown category", () => {
    expect(() => categoryChildren(tree, 12345)).toThrow("Category 12345 not found");
  });
});
