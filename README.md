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
