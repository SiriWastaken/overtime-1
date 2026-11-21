# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Next.js App Router (server components), TypeScript, plain CSS, Node built-in SQLite. Delegated: chosen for zero extra dependencies and a single self-hostable Node process that also serves the public API.

## Users

Two audiences with equal weight (confirmed):
- **Team strategists and scouts** at FRC events, on laptops and phones in noisy pits and stands, preparing for upcoming matches, judging opponents and partners, and building pick lists before alliance selection. Speed and density matter.
- **Analysts and enthusiasts** at a desk, exploring season ratings, model behaviour, calibration and validation; they want transparency and the ability to check the model's reasoning.

## Product Purpose

Overtime 1 measures what FRC robots can do *this season*, forecasts matches, rankings and playoffs with honest uncertainty, and shows its evidence. Success: forecasts that are calibrated and beat transparent baselines on a fair, reproducible walk-forward test, explained well enough that a student can see why a robot is rated as it is.

## Positioning

Strictly season-isolated ratings (no prior-season priors), a Bayesian per-component contribution model with exact partner-credit splitting, per-robot observed scoring where TBA breakdowns allow, leakage-free walk-forward validation published in the product, and a free public no-auth API. Inspired by Statbotics in scope; not a clone. No superiority claim over Statbotics without a fair comparison.

## Operating Context

Data comes only from The Blue Alliance API v3; freshness and TBA outages must be visible. Event day: match schedules, rankings, alliance selection (a few minutes, high pressure), double-elimination playoffs. Terminology: alliance (red/blue), quals/playoffs, RP (ranking points), captain/pick, double elimination, xPts (expected points contributed).

## Capabilities and Constraints

Team ratings with uncertainty and reliability; match forecasts (scores, 80% intervals, win/tie probability, RP); ranking simulation; playoff bracket simulation for supported formats; alliance pick values by simulated event-win probability; analytics (distributions, calibration, model comparison); methodology; public JSON API at /api/v1. Red and blue are semantic alliance colours. Unsupported playoff formats (round robin, custom) are stated, not faked.

## Brand Commitments

Name: "Overtime 1". Logo: original orbit-around-the-"1" mark (2026-11-20 brief). Direction: playful deep-space mission control; home is an explorable galaxy of teams; task-based navigation (Scout, Pick, Predict, Explore) with a ⌘K palette; one focused action per screen; no explanatory paragraphs on main screens (explanations behind "?" tips). Do not resemble match13.com (no sunset gradients, halftone art, centred pill nav, search hero, top-right season chip, entity-based nav or its tool names).

## Evidence on Hand

Only real TBA data and model outputs. No placeholder or synthetic data in the UI (synthetic data exists only under test/). The UI must keep honest empty states when data is missing. No testimonials, users, or accuracy claims exist yet.

## Product Principles

1. This season only: never let reputation or prior seasons leak into a rating.
2. Show uncertainty, not false precision: intervals and whole-percent probabilities.
3. Every number traceable: a user can follow a forecast back to robot contributions and data.
4. Fair evaluation: compare on identical matches with identical information.
5. Missing data is stated, never filled in.

## Accessibility & Inclusion

Red/blue alliance encoding must never be the only cue (labels/position as well); WCAG AA contrast; usable on phones at events.
