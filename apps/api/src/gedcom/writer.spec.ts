import { describe, expect, it } from "vitest";
import { buildGedcomDocument, normalizeGedcomForTest } from "./writer.js";

describe("buildGedcomDocument", () => {
  it("emits INDI, FAM with CHIL+PEDI, BIRT, SOUR, and Treemich custom id line", () => {
    const { gedcomUtf8, xrefs } = buildGedcomDocument(
      {
        personProfiles: [
          {
            id: "pp-dad",
            gender: "MALE",
            givenName: "Ann",
            surname: "Other",
            displayNameOverride: null,
            externalIds: {}
          },
          {
            id: "pp-mom",
            gender: "FEMALE",
            givenName: "Bob",
            surname: "Other",
            displayNameOverride: null,
            externalIds: {}
          },
          {
            id: "pp-child",
            gender: "UNKNOWN",
            givenName: "Kid",
            surname: "Other",
            displayNameOverride: null,
            externalIds: {},
            immichProviderPersonId: "immich-child"
          }
        ],
        relationships: [
          { id: "rel-sp", fromPersonId: "pp-dad", toPersonId: "pp-mom", type: "SPOUSE_OF", familyId: null }
        ],
        families: [
          {
            id: "fam-1",
            parent1PersonId: "pp-dad",
            parent2PersonId: "pp-mom",
            notes: "nuclear",
            children: [{ childPersonId: "pp-child", pedigree: "ADOPTED" }]
          }
        ],
        lifeEvents: [
          {
            id: "le-b",
            eventType: "BIRTH",
            customLabel: null,
            dateQualifier: "EXACT",
            year: 2010,
            month: 6,
            day: 1,
            endYear: null,
            endMonth: null,
            endDay: null,
            personId: "pp-child",
            relationshipId: null,
            familyId: null,
            notes: "hello",
            place: {
              id: "pl-1",
              name: "Town, ST",
              addressLine1: null,
              locality: "Town",
              adminArea: "ST",
              postalCode: null,
              countryCode: "US",
              latitude: 40.1,
              longitude: -74.2,
              notes: null
            },
            citations: [{ id: "cit-1", sourceId: "src-1", page: "12", notes: null }]
          },
          {
            id: "le-d",
            eventType: "DEATH",
            customLabel: null,
            dateQualifier: "EXACT",
            year: 2020,
            month: 1,
            day: 1,
            endYear: null,
            endMonth: null,
            endDay: null,
            personId: "pp-child",
            relationshipId: null,
            familyId: null,
            notes: null,
            place: null,
            citations: []
          }
        ],
        personNames: [],
        repositories: [
          {
            id: "repo-1",
            name: "State Archive",
            addressLine1: "1 Main",
            url: null,
            notes: null
          }
        ],
        sources: [
          {
            id: "src-1",
            repositoryId: "repo-1",
            title: "Vital Records",
            author: "Clerk",
            publication: "2024",
            url: null,
            notes: null
          }
        ],
        mediaObjects: [],
        mediaLinks: []
      },
      { includeTreemichCustomTags: true }
    );

    expect(xrefs.treemichGedcomXrefMapVersion).toBe(1);
    // Profiles are sorted by id: pp-child < pp-dad < pp-mom
    expect(xrefs.indi["I0001"]).toEqual({ personId: "pp-child" });
    expect(xrefs.indi["I0002"]).toEqual({ personId: "pp-dad" });
    expect(xrefs.fam["F0001"]?.familyId).toBe("fam-1");

    const norm = normalizeGedcomForTest(gedcomUtf8);
    expect(norm).toContain("0 @I0001@ INDI");
    expect(norm).toContain("1 _TREEMICH_IMMICH_PERSON_ID immich-child");
    expect(norm).toContain("1 _TREEMICH_PERSON_ID pp-dad");
    expect(norm).toContain("0 @F0001@ FAM");
    expect(norm).toContain("1 CHIL @I0001@");
    expect(norm).toContain("2 PEDI adopted");
    expect(norm).toContain("1 BIRT");
    expect(norm).toContain("2 DATE 1 JUN 2010");
    expect(norm).toContain("2 PLAC Town, ST");
    expect(norm).toContain("2 MAP");
    expect(norm).toContain("3 LATI N40.1");
    expect(norm).toContain("3 LONG W74.2");
    expect(norm).toContain("2 SOUR @S0001@");
    expect(norm).toContain("3 PAGE 12");
    expect(norm).toContain("0 @S0001@ SOUR");
    expect(norm).toContain("0 @R0001@ REPO");
    expect(norm).toContain("0 TRLR");
  });

  it("redacts living person events when redactLiving is true", () => {
    const { gedcomUtf8 } = buildGedcomDocument(
      {
        personProfiles: [
          {
            id: "pp-live",
            gender: "FEMALE",
            givenName: "Live",
            surname: "Person",
            displayNameOverride: null,
            externalIds: {}
          }
        ],
        relationships: [],
        families: [],
        lifeEvents: [
          {
            id: "le-b",
            eventType: "BIRTH",
            customLabel: null,
            dateQualifier: "EXACT",
            year: 2000,
            month: 1,
            day: 1,
            endYear: null,
            endMonth: null,
            endDay: null,
            personId: "pp-live",
            relationshipId: null,
            familyId: null,
            notes: "secret",
            place: null,
            citations: []
          }
        ],
        personNames: [],
        repositories: [],
        sources: [],
        mediaObjects: [],
        mediaLinks: []
      },
      { redactLiving: true }
    );
    const norm = normalizeGedcomForTest(gedcomUtf8);
    expect(norm).toContain("1 NAME Live /Person/");
    expect(norm).not.toContain("1 BIRT");
    expect(norm).not.toContain("secret");
  });

  it("emits OBJE records and pointers for person, life-event, and source media links", () => {
    const { gedcomUtf8, xrefs } = buildGedcomDocument({
      personProfiles: [
        {
          id: "pp-1",
          gender: "UNKNOWN",
          givenName: "Ann",
          surname: "Smith",
          displayNameOverride: null,
          externalIds: {}
        }
      ],
      relationships: [],
      families: [],
      lifeEvents: [
        {
          id: "le-1",
          eventType: "BIRTH",
          customLabel: null,
          dateQualifier: "EXACT",
          year: 1900,
          month: null,
          day: null,
          endYear: null,
          endMonth: null,
          endDay: null,
          personId: "pp-1",
          relationshipId: null,
          familyId: null,
          notes: null,
          place: null,
          citations: []
        }
      ],
      personNames: [],
      repositories: [],
      sources: [
        {
          id: "src-1",
          repositoryId: null,
          title: "Family Bible",
          author: null,
          publication: null,
          url: null,
          notes: null
        }
      ],
      mediaObjects: [
        { id: "m1", storageUrl: "/api/evidence/media/file/a.jpg", mimeType: "image/jpeg", title: "Portrait" },
        {
          id: "m2",
          storageUrl: "/api/evidence/media/file/b.pdf",
          mimeType: "application/pdf",
          title: "Birth certificate"
        }
      ],
      mediaLinks: [
        { mediaObjectId: "m1", targetType: "PERSON_PROFILE", targetId: "pp-1" },
        { mediaObjectId: "m2", targetType: "LIFE_EVENT", targetId: "le-1" },
        { mediaObjectId: "m2", targetType: "SOURCE", targetId: "src-1" }
      ]
    });

    const norm = normalizeGedcomForTest(gedcomUtf8);
    expect(xrefs.obje.O0001?.mediaObjectId).toBe("m1");
    expect(norm).toContain("0 @O0001@ OBJE");
    expect(norm).toContain("1 FILE /api/evidence/media/file/a.jpg");
    expect(norm).toContain("1 OBJE @O0001@");
    expect(norm).toContain("2 OBJE @O0002@");
    expect(norm).toContain("0 @S0001@ SOUR");
    expect(norm).toContain("1 OBJE @O0002@");
  });

  it("uses externalIds.gedcomFam as stable FAM xref when valid", () => {
    const { gedcomUtf8, xrefs } = buildGedcomDocument(
      {
        personProfiles: [
          {
            id: "pp-a",
            gender: "MALE",
            givenName: "A",
            surname: "One",
            displayNameOverride: null,
            externalIds: {}
          },
          {
            id: "pp-b",
            gender: "FEMALE",
            givenName: "B",
            surname: "Two",
            displayNameOverride: null,
            externalIds: {}
          }
        ],
        relationships: [
          { id: "rel-sp", fromPersonId: "pp-a", toPersonId: "pp-b", type: "SPOUSE_OF", familyId: null }
        ],
        families: [
          {
            id: "fam-stable",
            parent1PersonId: "pp-a",
            parent2PersonId: "pp-b",
            notes: null,
            externalIds: { gedcomFam: "IMPORTFAM1" },
            children: []
          }
        ],
        lifeEvents: [],
        personNames: [],
        repositories: [],
        sources: [],
        mediaObjects: [],
        mediaLinks: []
      },
      { includeTreemichCustomTags: false }
    );
    expect(gedcomUtf8).toContain("0 @IMPORTFAM1@ FAM");
    expect(xrefs.fam.IMPORTFAM1?.familyId).toBe("fam-stable");
  });

  it("omits Treemich custom tags when includeTreemichCustomTags is false", () => {
    const { gedcomUtf8 } = buildGedcomDocument(
      {
        personProfiles: [
          {
            id: "pp-1",
            gender: "UNKNOWN",
            givenName: "A",
            surname: "B",
            displayNameOverride: null,
            externalIds: {}
          }
        ],
        relationships: [],
        families: [],
        lifeEvents: [],
        personNames: [],
        repositories: [],
        sources: [],
        mediaObjects: [],
        mediaLinks: []
      },
      { includeTreemichCustomTags: false }
    );
    expect(gedcomUtf8).not.toContain("_TREEMICH_PERSON_ID");
  });
});
