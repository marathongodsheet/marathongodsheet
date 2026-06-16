# Marathon Godsheet

Marathon Godsheet is a web-based material and faction upgrade tracker. It is designed to help players track how many materials they still need, what materials they already have, and which faction upgrades have been completed.

## Current Changes

### Upgrade Tracking

* The Upgrade Tracking page is now the default/first page.
* All six faction trees are available as clickable faction buttons:

  * Cyberacme
  * Nucaloric
  * Traxus
  * Mida
  * Arachne
  * Sekiguchi
* Tree screenshots were updated and matched to their correct faction colors:

  * Cyberacme = lime green
  * Nucaloric = pinkish red
  * Traxus = orange
  * Mida = purple
  * Arachne = red
  * Sekiguchi = teal
* Clickable upgrade nodes are placed over each faction tree.
* Left-clicking an upgrade increases its tier.
* Right-clicking an upgrade decreases its tier.
* Upgrade labels now display only short tier labels:

  * `+` for unstarted upgrades
  * `T1`, `T2`, `T3`, etc. for normal tiers
  * `VIP1`, `VIP2`, `VIP3`, etc. for VIP tiers
* Full upgrade names are hidden from the node badges and only appear when hovering over a node.
* Upgrade tier labels were standardized across all faction trees.
* The “Selected Upgrade Materials” section was removed.
* The following buttons remain available:

  * Set Faction to Max
  * Reset This Faction
  * Reset All Factions
  * Undo Last Action

### Material Tracking

* Upgrade costs now subtract from material totals.
* Vault materials are used first before subtracting from remaining totals.
* Materials can still be added to or removed from the vault.
* The vault allows entering amounts higher than the current “materials left” value.
* Dashboard totals update based on normal upgrades, known VIP upgrades, and vault usage.
* Credits are ignored for material tracking.
* Sponsorship++ upgrades are treated as credits/cosmetic only and do not add material costs.

### VIP Upgrade Updates

* Cyberacme VIP material costs were added where known.
* Traxus VIP material costs were added where known.
* Mida VIP material costs were added where known.
* Unknown VIP upgrades are included as tier slots but currently have no material cost.
* Known VIP material costs were added to raw totals and dashboard totals.
* Save keys were kept the same so existing user progress should not reset after updates.

### UI / Layout

* The Dashboard table was renamed to “How many more materials do I need?”
* Materials with values of zero or below are highlighted as complete.
* Negative values are still shown but marked as completed.
* The Cataloging page includes:

  * In Vault
  * Raw total of Materials
* Transaction History was removed from the visible UI.
* “Made by Cuh” was added near the reset button.
* Bug report note was added:

  * To report a bug, email [marathongodsheet@gmail.com](mailto:marathongodsheet@gmail.com)

## Future Changes

* Continue adding missing VIP material costs as they are discovered.
* Add unknown VIP upgrade costs for:

  * Pinata
  * Petty Theft
  * Lucky Looter
  * Superior Mags
  * Superior Optics
  * BART
  * Grenade Case+
  * Any other unknown VIP upgrades
* Continue checking each faction tree for correct node placement and alignment.
* Verify that every upgrade node has the correct number of normal tiers and VIP tiers.
* Continue updating raw material totals whenever new upgrade costs are added.
* Keep localStorage/save keys unchanged unless a full progress reset is intentionally needed.
* Continue improving mobile and screen-size scaling for faction tree overlays.
* Add more verification screenshots or overlay check images when needed.
* Continue cleaning up faction tree screenshots if better background images become available.
