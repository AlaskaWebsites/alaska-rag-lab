import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { RagService } from '../modules/rag/services/rag.service.js';
import {
  evaluateResponse,
  generateEvalReport,
  type GoldenItem,
  type EvalResult,
} from '../modules/rag/evals/rag-eval.service.js';
import { pool } from '../core/database/db.js';

async function main() {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`📊 [MARCO 4: RAG EVALS — AVALIAÇÃO CONTÍNUA COM GOLDEN DATASET]`);
  console.log(`🎯 Testando a Tríade do RAG: Context Relevance, Faithfulness e Fail-Fast`);
  console.log(`${'='.repeat(80)}\n`);

  const datasetPath = path.resolve(process.cwd(), 'data/golden-dataset.json');
  const raw = await readFile(datasetPath, 'utf-8');
  const goldenDataset = JSON.parse(raw) as GoldenItem[];

  const rag = new RagService();
  const results: EvalResult[] = [];

  for (let i = 0; i < goldenDataset.length; i++) {
    const item = goldenDataset[i];
    process.stdout.write(`⏳ [${i + 1}/${goldenDataset.length}] Avaliando: "${item.question.slice(0, 45)}..." `);

    const start = performance.now();
    const response = await rag.ask(item.question, { debug: true });
    const latencyMs = Math.round(performance.now() - start);

    const isCacheHit = response.debug?.cacheHit ?? false;
    const evalResult = evaluateResponse(item, response, latencyMs, isCacheHit);
    results.push(evalResult);

    const tag = evalResult.statusMatch && evalResult.hitRateMatch ? '✅ PASS' : '❌ FAIL';
    const cacheTag = isCacheHit ? '⚡ (CACHE HIT)' : '';
    console.log(`${tag} [${latencyMs}ms] ${cacheTag}`);
  }

  const report = generateEvalReport(results);

  console.log(`\n${'='.repeat(80)}`);
  console.log(`🏆 RELATÓRIO CONSOLIDADO DE PERFORMANCE DO RAG`);
  console.log(`${'='.repeat(80)}`);
  console.log(`Total de Casos Avaliados:       ${report.totalEvaluated}`);
  console.log(`🎯 Hit Rate @ Top-3 (Recuperação): ${report.hitRate}%`);
  console.log(`🛡️ Acurácia do Fail-Fast:         ${report.failFastAccuracy}%`);
  console.log(`📖 Cobertura de Palavras-Chave:   ${report.avgKeywordCoverage}%`);
  console.log(`⏱️ Latência Média:                ${report.avgLatencyMs}ms`);
  console.log(`⏱️ Latência p95:                  ${report.p95LatencyMs}ms`);
  console.log(`${'='.repeat(80)}\n`);

  await pool.end();
}

main().catch((err) => {
  console.error('Erro ao executar avaliação do RAG:', err);
  process.exit(1);
});
