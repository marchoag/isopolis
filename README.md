# Isopolis

A tiny isometric city sim, a love letter to the classic 90s city builders.

**[Play it at labs.axiomic.ai/isopolis](https://labs.axiomic.ai/isopolis)**

## What makes it different

You don't own the city. You govern it, and only for as long as the residents let you.

You start with development rights over one small town's worth of land. Everything past
the amber city limit belongs to the county and has to be bought, parcel by parcel, at a
price that climbs with your city and dips in a recession.

Some of that ground already has people on it. Homesteads are families who were there
decades before you, and annexing the parcel around a house does not buy the house. Run
a road at one and it stops at the fence. You can pay far over the odds, fight it through
the courts for months, or bend the road around them and live with the dogleg forever.
Some owners will not sell at any price.

Protected land is its own argument. Opening it costs political capital and a council
vote you might lose.

Approval isn't a score, it's your vote share on election day. Lose an election and you
serve a shortened probation term with a chunk of the treasury gone. Lose the next one
too and the run is over, as it is if you stay in the red for ten straight months.

If you'd rather just build, Classic mode switches all of that off and gives you the
original sandbox.

## Running locally

It's one self-contained HTML file. Open `isopolis.html` in a browser and it runs.
(three.js loads from a CDN, so you'll want a connection the first time.)

## Tech

A single HTML file holding the markup, the CSS, and the whole simulation. Rendered in
real time with three.js. No build step, no bundler, nothing to install. Buildings are
generated procedurally from a seeded PRNG, so the same tile always grows the same
building.

## License

MIT, see [LICENSE](LICENSE).

The code is MIT. The Isopolis name and logo are not, see [TRADEMARKS.md](TRADEMARKS.md).

© 2026 Axiomic, LLC
