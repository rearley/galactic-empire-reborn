import { schemaModels } from "../helpers/schema-model";
/**
 * Schema fidelity audit — SC-001, SC-002, SC-006
 * Loads Prisma DMMF and asserts every field from data-model.md is present
 * with the correct scalar type and list-ness.
 */


// Map: modelName → required fields with type and isList
const REQUIRED_FIELDS: Record<string, { name: string; type: string; isList: boolean }[]> = {
  User: [
    { name: "userid", type: "String", isList: false },
    { name: "score", type: "BigInt", isList: false },
    { name: "noships", type: "Int", isList: false },
    { name: "topshipno", type: "Int", isList: false },
    { name: "kills", type: "Int", isList: false },
    { name: "rospos", type: "Int", isList: false },
    { name: "planets", type: "Int", isList: false },
    { name: "cash", type: "BigInt", isList: false },
    { name: "debt", type: "BigInt", isList: false },
    { name: "plscore", type: "BigInt", isList: false },
    { name: "klscore", type: "BigInt", isList: false },
    { name: "population", type: "BigInt", isList: false },
    { name: "options", type: "Int", isList: true },
    { name: "teamcode", type: "BigInt", isList: false },
  ],
  Ship: [
    { name: "userid", type: "String", isList: false },
    { name: "shipno", type: "Int", isList: false },
    { name: "shipname", type: "String", isList: false },
    { name: "shpclass", type: "Int", isList: false },
    { name: "heading", type: "Float", isList: false },
    { name: "head2b", type: "Float", isList: false },
    { name: "speed", type: "Float", isList: false },
    { name: "speed2b", type: "Float", isList: false },
    { name: "xcoord", type: "Float", isList: false },
    { name: "ycoord", type: "Float", isList: false },
    { name: "damage", type: "Float", isList: false },
    { name: "energy", type: "Float", isList: false },
    { name: "phasr", type: "Float", isList: false },
    { name: "phasrtype", type: "Int", isList: false },
    { name: "kills", type: "Int", isList: false },
    { name: "lastfired", type: "Int", isList: false },
    { name: "shieldtype", type: "Int", isList: false },
    { name: "shieldstat", type: "Int", isList: false },
    { name: "shield", type: "Int", isList: false },
    { name: "cloak", type: "Int", isList: false },
    { name: "degrees", type: "Int", isList: false },
    { name: "percent", type: "Int", isList: false },
    { name: "tactical", type: "Int", isList: false },
    { name: "helm", type: "Int", isList: false },
    { name: "train", type: "Int", isList: false },
    { name: "where", type: "Int", isList: false },
    { name: "ltorpsChannel", type: "Int", isList: true },
    { name: "ltorpsDistance", type: "Int", isList: true },
    { name: "lmisslChannel", type: "Int", isList: true },
    { name: "lmisslDistance", type: "Int", isList: true },
    { name: "lmisslEnergy", type: "Int", isList: true },
    { name: "decout", type: "Int", isList: true },
    { name: "jammer", type: "Int", isList: false },
    { name: "freq", type: "Int", isList: true },
    { name: "items", type: "BigInt", isList: true },
    { name: "titem", type: "Int", isList: false },
    { name: "hostile", type: "Int", isList: false },
    { name: "cantexit", type: "Int", isList: false },
    { name: "repair", type: "Int", isList: false },
    { name: "hypha", type: "Int", isList: false },
    { name: "firecntl", type: "Int", isList: false },
    { name: "destruct", type: "Int", isList: false },
    { name: "status", type: "Int", isList: false },
    { name: "cybmine", type: "Int", isList: false },
    { name: "cybskill", type: "Int", isList: false },
    { name: "cybupdate", type: "Int", isList: false },
    { name: "tick", type: "Int", isList: false },
    { name: "emulate", type: "Int", isList: false },
    { name: "minesnear", type: "Int", isList: false },
    { name: "lock", type: "Int", isList: false },
    { name: "holdcourse", type: "Int", isList: false },
    { name: "topspeed", type: "Int", isList: false },
    { name: "warncntr", type: "Int", isList: false },
  ],
  Sector: [
    { name: "xsect", type: "Int", isList: false },
    { name: "ysect", type: "Int", isList: false },
    { name: "plnum", type: "Int", isList: false },
    { name: "type", type: "Int", isList: false },
    { name: "numplan", type: "Int", isList: false },
  ],
  Planet: [
    { name: "xsect", type: "Int", isList: false },
    { name: "ysect", type: "Int", isList: false },
    { name: "plnum", type: "Int", isList: false },
    { name: "type", type: "Int", isList: false },
    { name: "xcoord", type: "Float", isList: false },
    { name: "ycoord", type: "Float", isList: false },
    { name: "userid", type: "String", isList: false },
    { name: "name", type: "String", isList: false },
    { name: "enviorn", type: "Int", isList: false },
    { name: "resource", type: "Int", isList: false },
    { name: "cash", type: "BigInt", isList: false },
    { name: "debt", type: "BigInt", isList: false },
    { name: "tax", type: "BigInt", isList: false },
    { name: "taxrate", type: "Int", isList: false },
    { name: "warnings", type: "Int", isList: false },
    { name: "password", type: "String", isList: false },
    { name: "lastattack", type: "String", isList: false },
    { name: "beacon", type: "String", isList: false },
    { name: "spyowner", type: "String", isList: false },
    { name: "technology", type: "Int", isList: false },
    { name: "teamcode", type: "BigInt", isList: false },
    { name: "itemsQty", type: "BigInt", isList: true },
    { name: "itemsRate", type: "Int", isList: true },
    { name: "itemsSell", type: "Int", isList: true },
    { name: "itemsReserve", type: "Int", isList: true },
    { name: "itemsMarkup2a", type: "Int", isList: true },
    { name: "itemsSold2a", type: "BigInt", isList: true },
  ],
  Wormhole: [
    { name: "xsect", type: "Int", isList: false },
    { name: "ysect", type: "Int", isList: false },
    { name: "plnum", type: "Int", isList: false },
    { name: "type", type: "Int", isList: false },
    { name: "xcoord", type: "Float", isList: false },
    { name: "ycoord", type: "Float", isList: false },
    { name: "visible", type: "Int", isList: false },
    { name: "destXcoord", type: "Float", isList: false },
    { name: "destYcoord", type: "Float", isList: false },
    { name: "name", type: "String", isList: false },
  ],
  Team: [
    { name: "teamcode", type: "BigInt", isList: false },
    { name: "teamname", type: "String", isList: false },
    { name: "teamcount", type: "Int", isList: false },
    { name: "teamscore", type: "BigInt", isList: false },
    { name: "password", type: "String", isList: false },
    { name: "secret", type: "String", isList: false },
    { name: "flag", type: "Int", isList: false },
  ],
  Mail: [
    { name: "userid", type: "String", isList: false },
    { name: "class", type: "Int", isList: false },
    { name: "msgno", type: "BigInt", isList: false },
    { name: "type", type: "Int", isList: false },
    { name: "stamp", type: "Int", isList: false },
    { name: "dtime", type: "String", isList: false },
    { name: "topic", type: "String", isList: false },
    { name: "string1", type: "String", isList: false },
    { name: "name1", type: "String", isList: false },
    { name: "name2", type: "String", isList: false },
    { name: "int1", type: "Int", isList: false },
    { name: "int2", type: "Int", isList: false },
    { name: "int3", type: "Int", isList: false },
    { name: "long1", type: "BigInt", isList: false },
    { name: "long2", type: "BigInt", isList: false },
    { name: "long3", type: "BigInt", isList: false },
  ],
  MailStat: [
    { name: "userid", type: "String", isList: false },
    { name: "class", type: "Int", isList: false },
    { name: "msgno", type: "BigInt", isList: false },
    { name: "type", type: "Int", isList: false },
    { name: "stamp", type: "Int", isList: false },
    { name: "dtime", type: "String", isList: false },
    { name: "topic", type: "String", isList: false },
    { name: "name1", type: "String", isList: false },
    { name: "int1", type: "Int", isList: false },
    { name: "int2", type: "Int", isList: false },
    { name: "cash", type: "BigInt", isList: false },
    { name: "debt", type: "BigInt", isList: false },
    { name: "tax", type: "BigInt", isList: false },
    { name: "itemqty", type: "BigInt", isList: true },
  ],
  ShipClass: [
    { name: "classNumber", type: "Int", isList: false },
    { name: "typeName", type: "String", isList: false },
    { name: "shipNameTemplate", type: "String", isList: false },
    { name: "category", type: "String", isList: false },
    { name: "maxShields", type: "Int", isList: false },
    { name: "maxPhaser", type: "Int", isList: false },
    { name: "hasTorpedo", type: "Boolean", isList: false },
    { name: "hasMissile", type: "Boolean", isList: false },
    { name: "hasDecoy", type: "Boolean", isList: false },
    { name: "hasJammer", type: "Boolean", isList: false },
    { name: "hasZipper", type: "Boolean", isList: false },
    { name: "hasMine", type: "Boolean", isList: false },
    { name: "canAttackPlanet", type: "Boolean", isList: false },
    { name: "hasCloak", type: "Boolean", isList: false },
    { name: "maxAcceleration", type: "Int", isList: false },
    { name: "maxWarp", type: "Int", isList: false },
    { name: "maxTons", type: "Int", isList: false },
    { name: "maxPrice", type: "BigInt", isList: false },
    { name: "scanRange", type: "Int", isList: false },
    { name: "points", type: "Int", isList: false },
    { name: "damageFactor", type: "Int", isList: false },
    { name: "cybCanAttack", type: "Boolean", isList: false },
    { name: "cybLowestClassAttacks", type: "Int", isList: false },
    { name: "noClaim", type: "Int", isList: false },
    { name: "make", type: "Int", isList: false },
    { name: "tough", type: "Int", isList: false },
  ],
  Mine: [
    { name: "id", type: "Int", isList: false },
    { name: "channel", type: "Int", isList: false },
    { name: "timer", type: "Int", isList: false },
    { name: "xcoord", type: "Float", isList: false },
    { name: "ycoord", type: "Float", isList: false },
    { name: "deployedBy", type: "String", isList: false },
    { name: "deployedAt", type: "DateTime", isList: false },
  ],
};

describe("Schema fidelity audit (SC-001, SC-002, SC-006)", () => {
  const models = schemaModels();
  const modelMap = new Map(models.map((m) => [m.name, m]));

  for (const [modelName, requiredFields] of Object.entries(REQUIRED_FIELDS)) {
    describe(`${modelName}`, () => {
      const model = modelMap.get(modelName);

      it(`model ${modelName} exists in schema`, () => {
        expect(model).toBeDefined();
      });

      if (!model) return;

      const fieldMap = new Map(model.fields.map((f) => [f.name, f]));

      for (const { name, type, isList } of requiredFields) {
        it(`has field "${name}" of type ${type}${isList ? "[]" : ""}`, () => {
          const field = fieldMap.get(name);
          expect(field).toBeDefined();
          expect(field?.type).toBe(type);
          expect(field?.isList).toBe(isList);
        });
      }
    });
  }
});
