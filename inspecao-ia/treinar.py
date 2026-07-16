"""
Treino: lê as fotos de peças BOAS em ./pecas_boas, constrói o "banco" de
referência e calcula um limite de decisão. Salva em ./modelo.

Uso:
    python treinar.py
"""
import os
import json
import glob
import numpy as np
from embedding import embedding_de_arquivo

PASTA_BOAS = "pecas_boas"
PASTA_MODELO = "modelo"
EXTENSOES = ("*.jpg", "*.jpeg", "*.png", "*.bmp", "*.webp")


def listar_imagens(pasta):
    arquivos = []
    for ext in EXTENSOES:
        arquivos += glob.glob(os.path.join(pasta, ext))
        arquivos += glob.glob(os.path.join(pasta, ext.upper()))
    return sorted(set(arquivos))


def menor_distancia(vetor, banco, ignorar_idx=None):
    """Menor distância euclidiana de `vetor` aos vetores do banco."""
    d = np.linalg.norm(banco - vetor, axis=1)
    if ignorar_idx is not None:
        d[ignorar_idx] = np.inf
    return float(d.min())


def main():
    imagens = listar_imagens(PASTA_BOAS)
    if len(imagens) < 5:
        raise SystemExit(
            f"Coloque ao menos ~20 fotos de pecas boas em '{PASTA_BOAS}/' "
            f"(encontradas: {len(imagens)})."
        )

    print(f"Lendo {len(imagens)} imagens de peças boas...")
    banco = np.stack([embedding_de_arquivo(p) for p in imagens])

    # Distância "leave-one-out": para cada peça boa, distância à boa mais próxima.
    # O limite de decisão é a maior dessas distâncias com uma margem de segurança.
    dists = [menor_distancia(banco[i], banco, ignorar_idx=i) for i in range(len(banco))]
    dists = np.array(dists)
    base = float(dists.max())
    margem = 1.30  # 30% de folga; ajuste no config.json depois
    limite = round(base * margem, 6)

    os.makedirs(PASTA_MODELO, exist_ok=True)
    np.save(os.path.join(PASTA_MODELO, "banco.npy"), banco)
    config = {
        "limite": limite,
        "distancia_max_boas": base,
        "media_boas": float(dists.mean()),
        "n_amostras": len(imagens),
        "obs": "limite menor = mais rigoroso; limite maior = mais tolerante",
    }
    with open(os.path.join(PASTA_MODELO, "config.json"), "w", encoding="utf-8") as f:
        json.dump(config, f, indent=2, ensure_ascii=False)

    print("Treino concluído.")
    print(f"  amostras boas: {len(imagens)}")
    print(f"  distância máx entre boas: {base:.4f}")
    print(f"  limite sugerido: {limite:.4f}")
    print(f"Modelo salvo em '{PASTA_MODELO}/'.")


if __name__ == "__main__":
    main()
