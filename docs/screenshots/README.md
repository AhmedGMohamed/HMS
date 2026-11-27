# Screenshot Capture Guide

The main [`README.md`](../../README.md) references the files below. Save real captures in this folder using these exact filenames so the placeholders resolve without further edits.

## Capture checklist

| # | File | Screen | Must show |
|---|---|---|---|
| 1 | `login.png` | Login | Branding, email/username + password fields, language toggle, theme toggle |
| 2 | `dashboard-admin.png` | Admin dashboard | 5 KPI tiles, revenue line chart, distribution donut, recent activity feed |
| 3 | `patients-list.png` | Patients | DataTable with search + pagination, and the Staff Status tab visible (or a second capture) |
| 4 | `patient-billing.png` | Patient detail → Billing | Bill totals, discount/VAT scopes applied, printable bill action |
| 5 | `pharmacy.png` | Pharmacy | Drug cards, low-stock / near-expiry KPI strip, dispense action |
| 6 | `reports-statistics.png` | Reports → Statistics | At least two charts rendered plus the export menu open |
| 7 | `command-palette.png` | Command palette | Palette open (Ctrl/Cmd-K) with module results visible |
| 8 | `dark-rtl.png` | Dark mode + Arabic | True-dark theme with Arabic UI and mirrored RTL layout |
| 9 | `electron-config.png` | Electron first launch | Server URL form with a successful health-probe result |

## Tips for consistent, professional captures

- **Window size**: capture at **1440×900** (or 1920×1080) for the in-app screens; the Electron config window is 700×900.
- **Data**: use realistic but non-sensitive demo data (fictional patients, drugs, employees).
- **Theme**: capture most screens in **light** mode; use `dark-rtl.png` to showcase true-dark and Arabic.
- **Privacy**: blur or replace any personal data, real names, phone numbers, or internal server addresses.
- **Format**: PNG, optimized (e.g. `pngquant` / TinyPNG) to keep the repository light.
- **Clean UI**: dismiss toasts and close hover popovers unless they are the subject of the shot.

## Suggested gallery (paste into `README.md` once files exist)

```markdown
| | |
|---|---|
| ![Login](docs/screenshots/login.png) | ![Admin Dashboard](docs/screenshots/dashboard-admin.png) |
| ![Patients](docs/screenshots/patients-list.png) | ![Patient Billing](docs/screenshots/patient-billing.png) |
| ![Pharmacy](docs/screenshots/pharmacy.png) | ![Reports](docs/screenshots/reports-statistics.png) |
| ![Command Palette](docs/screenshots/command-palette.png) | ![Dark RTL](docs/screenshots/dark-rtl.png) |

![Electron Setup](docs/screenshots/electron-config.png)
```

> Tip: after adding images, also update the **Screenshots** section of the root README — replace the placeholder note with the gallery above.
