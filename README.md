# Marathon Godsheet

Made by Cuh

Marathon Godsheet is an interactive material and faction upgrade tracker. It tracks materials by rarity, lets you reserve materials in a vault, and updates the totals table as faction upgrades are selected.

For bug reports, send an email with the issue to:

marathongodsheet@gmail.com

---

## How to Open the Site

1. Download the website zip file.
2. Right-click the zip file and choose **Extract All**.
3. Open the extracted folder.
4. Double-click **index.html**.

The site should open in your browser.

Do not open the site directly from inside the zip file. Extract it first.

---
## This is not complete as we do not know the cost for VIP nodes yet

## Main Tabs

The website has two main tabs:

1. **Dashboard**
2. **Upgrade Tracking**

---

## Dashboard Tab

The Dashboard is the main material tracking page.

It includes:

- **TOTALS LEFT** table
- **In Vault** box
- **Material Dropdowns by Rarity**
- **Transaction History**

---

## TOTALS LEFT Table

The **TOTALS LEFT** table shows how many materials are still available.

Materials are grouped by rarity:

- Grey
- Green
- Blue
- Purple
- Gold

The table updates automatically when:

- Materials are added to the vault
- Materials are removed from the vault
- Upgrade tiers are selected
- A faction is reset
- A faction is set to max

A material total is highlighted green only when it reaches **0**.

---

## In Vault

The **In Vault** section is used for materials that are reserved for upgrades.

Vault logic:

- Adding material to the vault subtracts it from **TOTALS LEFT**.
- Removing material from the vault adds it back to **TOTALS LEFT**.
- If an upgrade uses a material that is already in the vault, it removes the material from the vault first.
- If the vault covers the full upgrade cost, **TOTALS LEFT** does not decrease again.
- If the vault only covers part of the upgrade cost, only the missing amount is subtracted from **TOTALS LEFT**.

