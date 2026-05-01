/**
 * @file Static help content for the Profile workspace (right Info column).
 */

import { memo } from "react";

export const ProfileInfoPane = memo(() => (
  <section className="card stack profile-info-pane" aria-label="Profile workspace help">
    <div className="stack">
      <h2>Using Profile</h2>
      <p className="hint">
        Profile is the full-page editor for one person. The tree and other workspaces share the same selected
        person: changing the profile here updates selection everywhere, and your last choice is remembered.
      </p>
    </div>
    <div className="stack">
      <h3>Search</h3>
      <p className="hint">
        Type at least two characters to search by display name, given name, surname, nicknames, alternate
        names, or linked provider identities. Results load in pages of ten; scroll the list for more.
        Keyboard: Arrow keys move, Enter selects, Escape closes the list.
      </p>
    </div>
    <div className="stack">
      <h3>View in tree</h3>
      <p className="hint">
        Queues the 3D tree camera on the current person. Switch to the Tree workspace to see them focused
        there.
      </p>
    </div>
    <div className="stack">
      <h3>Identity fields</h3>
      <p className="hint">
        Given name, surname, nicknames, and gender feed Treemich display rules and relationship wording. Birth
        and death dates shown here may sync with life events when you save the profile.
      </p>
    </div>
    <div className="stack">
      <h3>Life events</h3>
      <p className="hint">
        Birth, death, residence, and custom events hold dated facts, often with places and citations. They can
        drive parts of the profile summary.
      </p>
    </div>
    <div className="stack">
      <h3>Names</h3>
      <p className="hint">
        Alternate Treemich names help disambiguation and search. They are distinct from nicknames on the
        primary profile.
      </p>
    </div>
    <div className="stack">
      <h3>Relatives and families</h3>
      <p className="hint">
        Relatives lists graph edges you can edit. Families represent unions/households with parents and
        children; household-scoped events attach to a family.
      </p>
    </div>
    <div className="stack">
      <h3>Timeline</h3>
      <p className="hint">
        The timeline merges person, relationship, and family-scoped events into a single chronological view.
      </p>
    </div>
    <div className="stack">
      <h3>Media and external identities</h3>
      <p className="hint">
        Thumbnails and Immich links connect Treemich people to external galleries when configured.
      </p>
    </div>
    <div className="stack">
      <h3>Unsaved changes</h3>
      <p className="hint">
        If you edit inline profile fields and try to pick another search result, create a person, or leave
        Profile, you will be asked to discard unsaved changes first. Discarding reloads people from the server
        to reset the form.
      </p>
    </div>
  </section>
));

ProfileInfoPane.displayName = "ProfileInfoPane";
