const fs = require('fs');
const path = require('path');

const targetFile = path.join(__dirname, 'index.js');
console.log(`Patching file: ${targetFile}`);

let content = fs.readFileSync(targetFile, 'utf8');

// The OLD query snippet to find
const oldQuery = `SELECT CODPROD, DESCRPROD, COMPLDESC, CODVOL, ATIVO, REFERENCIA, PESOLIQ, DTALTER, NCM, MARCA, CODGRUPOPROD 
      FROM TGFPRO 
      WHERE ATIVO = 'S'`;

// The OLD query snippet (Version found in logs - simpler one)
const oldQuerySimple = `SELECT CODPROD, DESCRPROD, COMPLDESC, CODVOL, ATIVO, REFERENCIA, PESOLIQ, DTALTER 
      FROM TGFPRO 
      WHERE ATIVO = 'S'`;

// The NEW Query
const newQuery = `SELECT 
        P.CODPROD, P.DESCRPROD, P.COMPLDESC, P.CODVOL, P.ATIVO, P.REFERENCIA, P.PESOLIQ, P.DTALTER, P.NCM, P.MARCA,
        G.DESCRGRUPOPROD, V.DESCRVOL,
        E.VLRVENDA
      FROM TGFPRO P
      LEFT JOIN TGFGRU G ON P.CODGRUPOPROD = G.CODGRUPOPROD
      LEFT JOIN TGFVOL V ON P.CODVOL = V.CODVOL
      LEFT JOIN TGFEXC E ON P.CODPROD = E.CODPROD AND E.NUTAB = 1
      WHERE P.ATIVO = 'S'`;

// Mapping logic replacement
const oldMap = `const properties = {
        name: prod.DESCRPROD,
        hs_sku: sku,
        description: prod.COMPLDESC || undefined,
        ncm: prod.NCM || undefined,
        unidade_medida: prod.CODVOL || undefined,
        marca: prod.MARCA || undefined,
        grupo: prod.CODGRUPOPROD || undefined
      };`;

const oldMapSimple = `const properties = {
        name: prod.DESCRPROD,
        hs_sku: sku,
        description: prod.COMPLDESC || undefined
      };`;

const newMap = `const properties = {
        name: prod.DESCRPROD,
        price: prod.VLRVENDA || undefined,
        hs_sku: sku,
        description: prod.COMPLDESC || undefined,
        ncm: prod.NCM || undefined,
        unidade_medida: prod.CODVOL || undefined, // Código da unidade
        descricao_unidade: prod.DESCRVOL || undefined, // Descrição da unidade
        marca: prod.MARCA || undefined,
        grupo: prod.DESCRGRUPOPROD || undefined // Descrição do grupo
      };`;

let patched = false;

// Attempt Replace Query
if (content.includes("SELECT CODPROD, DESCRPROD")) {
    // Regex replace to bridge minor whitespace diffs
    const regexQuery = /SELECT\s+CODPROD,\s+DESCRPROD[\s\S]+?FROM\s+TGFPRO[\s\S]+?WHERE\s+ATIVO\s+=\s+'S'/;

    if (regexQuery.test(content)) {
        content = content.replace(regexQuery, newQuery);
        console.log("✅ Query Updated!");
        patched = true;
    } else {
        console.log("⚠️ Could not match query via Regex.");
    }
}

// Attempt Replace Map
const regexMap = /const\s+properties\s+=\s+\{[\s\S]+?\};/;
if (regexMap.test(content)) {
    content = content.replace(regexMap, newMap);
    console.log("✅ Mapping Object Updated!");
    patched = true;
} else {
    console.log("⚠️ Could not match properties object via Regex.");
}

if (patched) {
    fs.writeFileSync(targetFile, content, 'utf8');

    // Check if JOIN exists now
    if (content.includes("LEFT JOIN TGFEXC")) {
        console.log("🎉 SUCCESS: File contains new joins!");
    } else {
        console.log("❌ ERROR: File saved but new join not found?");
    }
} else {
    console.log("❌ No changes made. Patterns not found.");
}
