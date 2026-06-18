"""
Extração de "impressão digital" (embedding) de uma imagem usando uma rede
ResNet18 pré-treinada (ImageNet). Compartilhado entre treino e servidor.
"""
import numpy as np
from PIL import Image
import torch
import torchvision.transforms as T
from torchvision.models import resnet18, ResNet18_Weights

_device = "cuda" if torch.cuda.is_available() else "cpu"

# Pré-processamento padrão ImageNet
_transform = T.Compose([
    T.Resize(256),
    T.CenterCrop(224),
    T.ToTensor(),
    T.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
])

# Carrega a ResNet18 e remove a última camada (fica o vetor de 512 dimensões)
_weights = ResNet18_Weights.DEFAULT
_model = resnet18(weights=_weights)
_model.fc = torch.nn.Identity()
_model.eval().to(_device)


def embedding_de_imagem(img: Image.Image) -> np.ndarray:
    """Recebe uma imagem PIL e devolve um vetor (512,) normalizado."""
    img = img.convert("RGB")
    x = _transform(img).unsqueeze(0).to(_device)
    with torch.no_grad():
        v = _model(x).squeeze(0).cpu().numpy().astype("float32")
    # normaliza para que a distância dependa do padrão, não do brilho global
    n = np.linalg.norm(v)
    return v / n if n > 0 else v


def embedding_de_arquivo(caminho: str) -> np.ndarray:
    return embedding_de_imagem(Image.open(caminho))
