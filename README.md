Marathon Godsheet site v45

Corrected faction tree image color mapping: Cyberacme lime green, Nucaloric pinkish red, Traxus orange, Mida purple, Arachne red, Sekiguchi teal. Save/localStorage keys remain unchanged.

Marathon Godsheet Site v24
==========================

This version rechecks and tightens faction upgrade node overlays, with special fixes for Mida and Cyberacme alignment.

# Marathon Godsheet Website

Open `index.html` locally, or upload this folder to GitHub Pages / Netlify.

## Saving progress
The site automatically saves each user's progress in that browser using localStorage:

- material totals
- vault contents
- transaction history
- selected upgrade tiers
- selected faction
- active tab
- page scroll position

This means a published GitHub Pages copy will remember where that person left off on the same browser/device. It does not share saves between different devices unless the user exports/imports the save file.

## Publishing with GitHub Pages
1. Create a GitHub repository.
2. Upload the contents of this folder, not the zip file itself.
3. Go to Settings > Pages.
4. Choose Deploy from branch.
5. Select the `main` branch and `/root`.
6. Save. GitHub will give you the website link.

## Publishing with Netlify
1. Unzip the folder.
2. Go to Netlify.
3. Drag the whole unzipped website folder into Netlify's deploy area.


## v21 update
- Cyberacme node labels and button positions were rebuilt from the video, including the Sponsorship / Implant Stock placement issue.
- Button overlays were rechecked across all factions.
- Browser save keys were bumped to v21 so old misplaced upgrade states do not interfere.


## v21 notes
- Cyberacme overlay was rebuilt to 16 total physical nodes: 13 non-VIP and 3 VIP.
- Cyberacme node buttons were re-centered tightly over the screenshot nodes.
- Carrier+ was separated into its own physical node so the Cyberacme node count matches the visible tree.


## v23 update

- Added the missing Cyberacme Carrier+ Barter physical node.
- Kept Max Looter Barter on the rightmost node of the three barter nodes.
- Cyberacme now has 17 physical nodes total: 14 non-VIP nodes and 3 VIP nodes.
- Browser save keys were bumped to v23 so old Cyberacme node state does not interfere.


## v23 fix
Traxus circled deluxe/enhanced nodes were swapped so Deluxe is on the left and Enhanced is on the right for Chips, Mags, and Optics.


## Overlay check images

The `overlay_checks` folder includes labeled JPEGs for each faction. Each clickable node area is drawn over the faction tree screenshot with the node name inside its square, so placement and labels can be reviewed before publishing.


## v46 update
- Added known Cyberacme VIP material costs for Hoarder's Barter, Bountiful.EXE, and Discounted Templates.
- Set Cyberacme Pinata and Petty Theft to 2 normal tiers + 2 unknown VIP tiers.
- Set Cyberacme Lucky Looter to 1 normal tier + 2 unknown VIP tiers.
- Increased default Nueral Insulation and Predictive Framework totals so saved users receive the delta without wiping progress.


## v48 update
- Traxus top-right VIP node renamed to M77.
- M77 cost added: Alien Alloy x1 and Ballistic Turbine x7.
- Raw totals updated for Alien Alloy and Ballistic Turbine.
- Save keys unchanged.
