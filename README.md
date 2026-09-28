# MTG Card Vault

Photograph your Magic: The Gathering cards, let Claude read them, and keep the whole collection in a shared, searchable vault inside Cribl.

## Summary

MTG Card Vault is a Cribl app for cataloging physical trading cards. It helps users turn a phone photo into structured card records, browse their collection as a glowing card wall, and keep notes and counts for every card.

## What This App Does

* Primary purpose: keep a digital inventory of physical cards, added from photos.
* Key capabilities:
  * Drop a photo of one card or a whole spread. Claude reads every card it can see and returns the name, mana cost, type, rules text, rarity, and collector number, plus a crop of each card face.
  * Review and correct the reading before it is saved.
  * Browse the vault with search, color filters, and sorting. Cards tilt toward the cursor and rares shimmer.
  * Open any card to flip it, adjust how many copies you own, add notes, or remove it.
* Intended users: anyone in the Cribl org who collects cards. The vault is shared.
* Works with: Cribl.Cloud and any Leader running the App Platform.

## When To Use This App

* You want a quick digital inventory of a card collection without typing every card by hand.
* You want a shared list your team can browse and add to.
* You want a showpiece demo of the App Platform's KV store and external proxy.

## Before You Install

* Required: a Cribl deployment with the App Platform enabled.
* Required: an Anthropic API key. After installing, open the app, click the gear icon, and paste the key. It is stored in the app's own KV store and injected by the platform on each request. Browsers never see it.
* External domain used: `api.anthropic.com` (declared in `config/proxies.yml`).
* Product API paths used: none. The app only uses its own KV store and proxy.

## How To Use

1. Open the app and click **Add cards**.
2. Drop a photo or choose one. A well-lit, straight-on shot works best. Four to six cards per photo is a comfortable size.
3. Wait for the read, correct anything that looks off, and click **Add to vault**.
4. Click any card to see its details, change the count, or add notes.

## Data and Privacy

* Card records and card images are stored in the app-scoped KV store on the Leader.
* Photos are sent to the Anthropic API for reading and are not stored anywhere else.
* Removing a card asks for confirmation and cannot be undone.

## Support

Built by VisiCore Tech for the Cribl App Platform hackathon.
