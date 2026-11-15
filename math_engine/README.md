# LOTUS AI — Motor Matemático (Python)

Módulo científico totalmente desacoplado da interface visual e do backend web (Node.js/Express).

## Princípio Matemático Fundamental

Em sorteios justos e independentes, resultados anteriores **não alteram** a probabilidade matemática dos próximos resultados.

Este motor separa rigorosamente:
1. **Probabilidade Teórica** (combinatória exata, distribuição hipergeométrica)
2. **Frequência Histórica Descritiva** (estatística empírica sobre concursos verificados)
3. **Simulações Monte Carlo** (com semente aleatória explícita e reproduzível)
4. **Backtesting Histórico de Estratégias** (avaliação retrospectiva transparente)

## Limitação no Ambiente Google AI Studio

O container padrão do Google AI Studio executa Node.js e não possui `numpy`, `scipy` e `pandas` pré-instalados globalmente. Por isso, este motor foi estruturado como um microsserviço independente preparado para execução via Docker / Cloud Run / ambiente Python dedicado, comunicando-se com o backend Node.js através do contrato REST definido em `MATH_ENGINE_URL`.

## Execução Externa (Produção / Local Python)

```bash
cd math_engine
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8001
```
