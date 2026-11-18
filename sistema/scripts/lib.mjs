// Funções comuns dos importadores. Eles escrevem SQL na saída padrão; nunca guardam dados no repositório.
import { readFileSync } from 'node:fs';

export const lerJson = arquivo => JSON.parse(readFileSync(arquivo, 'utf8').replace(/^﻿/, ''));

// Texto SQL seguro: aspas simples dobradas, nulo vira null.
export const q = v => (v === null || v === undefined || v === '') ? 'null' : `'${String(v).replace(/'/g, "''")}'`;
export const n = v => (v === null || v === undefined || v === '' || Number.isNaN(Number(v))) ? 'null' : String(Number(v));

// Normaliza nome para comparar: minúsculo, sem acento, sem parênteses, sem pontuação.
export const norm = s => String(s || '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/\(.*?\)/g, ' ').replace(/[^a-z0-9 ]+/g, ' ')
  .replace(/\s+/g, ' ').trim();

export const sai = linhas => process.stdout.write(linhas.join('\n') + '\n');
