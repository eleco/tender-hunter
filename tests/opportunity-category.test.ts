import assert from "node:assert/strict";
import test from "node:test";
import { countByOpportunityCategory, getOpportunityCategory, getOpportunityCategoryLabel } from "@/lib/opportunity-category";

test("procurement sources are categorized as tenders", () => {
  assert.equal(getOpportunityCategory({
    source: "ted",
    title: "Open procedure for cloud hosting services",
    description: "Procurement notice for managed services.",
    procedureType: "Open procedure",
  }), "tender");
});

test("funding language is categorized as grant", () => {
  assert.equal(getOpportunityCategory({
    source: "eccp-funding",
    title: "Cascade funding for textile SMEs",
    description: "Financial support vouchers for SMEs under an innovation programme.",
    procedureType: "funding-opportunity",
  }), "grant");
});

test("call language without grant wording is categorized as open call", () => {
  assert.equal(getOpportunityCategory({
    source: "eccp-funding",
    title: "Open call for pilot applications",
    description: "Applications are open until 31 May 2026.",
    procedureType: "funding-opportunity",
  }), "open-call");
});

test("category counts and labels stay stable", () => {
  const counts = countByOpportunityCategory([
    { source: "ted", title: "Open procedure", description: "", procedureType: "Open procedure" },
    { source: "eccp-funding", title: "Open call for pilots", description: "Applications are open.", procedureType: "funding-opportunity" },
    { source: "eccp-funding", title: "Grant scheme for SMEs", description: "Funding available.", procedureType: "funding-opportunity" },
  ]);

  assert.deepEqual(counts, {
    tender: 1,
    "open-call": 1,
    grant: 1,
  });
  assert.equal(getOpportunityCategoryLabel("open-call"), "Open call");
});
