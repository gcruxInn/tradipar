import { sankhyaApi } from '../adapters/sankhya.api';
import { hubspotApi } from '../adapters/hubspot.api';

// Helper: Fix Encoding
function fixEncoding(str: string | null | undefined): string | null | undefined {
  if (!str) return str;
  try {
    if (str.match(/[ÃÂ][\x80-\xBF]/)) {
      return Buffer.from(str, 'binary').toString('utf8');
    }
  } catch (e) { return str; }
  return str;
}

class OrderService {

  // ================================================================
  // LIBERAÇÕES (Approval Workflow)
  // ================================================================

  public async getPendingApprovals(nunota: string) {
    const resp = await sankhyaApi.post<any>(
      '/gateway/v1/mgecom/service.sbr?serviceName=GlbConsSolLiberacoesSP.carregarSolicitacoes&outputType=json',
      {
        serviceName: "GlbConsSolLiberacoesSP.carregarSolicitacoes",
        requestBody: { nunota: { "$": nunota.toString() } }
      }
    );
    const result = resp.data;
    console.log(`[LIBERACOES] Pending for NUNOTA ${nunota}:`, JSON.stringify(result).substring(0, 500));

    if (result.status !== "1") {
      return { success: true, pendentes: [], needsRelease: false };
    }

    const solicitacoes = result.responseBody?.solicitacoes?.solicitacao || result.responseBody?.solicitacoes || [];
    const items = Array.isArray(solicitacoes) ? solicitacoes : [solicitacoes];

    const pendentes = items.map((s: any) => ({
      codevento: s.CODEVENTO?.$ || s.CODEVENTO,
      descricao: fixEncoding(s.DESCRCODIGOS?.$ || s.DESCRCODIGOS || s.DESCEVENTO?.$ || s.DESCEVENTO || '') as string,
      vlrMinimo: parseFloat(s.VLRMINIMO?.$ || s.VLRMINIMO || 0),
      vlrAtual: parseFloat(s.VLRATUAL?.$ || s.VLRATUAL || 0),
      dtalibpend: s.DTALIBPEND?.$ || s.DTALIBPEND || null,
      codusuliber: s.CODUSULIBER?.$ || s.CODUSULIBER || null
    }));

    return {
      success: true, nunota, pendentes,
      needsRelease: pendentes.some((p: any) => !p.dtalibpend),
      allApproved: pendentes.every((p: any) => !!p.dtalibpend)
    };
  }

  public async searchApprovers(q?: string, limit: number = 20) {
    const whereClause = q ? `WHERE NOMUSU LIKE '%${q}%' AND ATIVO = 'S'` : `WHERE ATIVO = 'S'`;
    const resp = await sankhyaApi.post<any>('/gateway/v1/mge/service.sbr?serviceName=DbExplorerSP.executeQuery&outputType=json', {
      serviceName: "DbExplorerSP.executeQuery",
      requestBody: { sql: `SELECT CODUSU, NOMUSU, CODGRUPO, EMAIL FROM TGFUSU ${whereClause} ORDER BY NOMUSU FETCH FIRST ${limit} ROWS ONLY` }
    });

    const rows = resp.data?.responseBody?.rows || [];
    const liberadores = rows.map((row: any) => ({
      codusu: row[0],
      nome: fixEncoding(String(row[1] || '')) as string,
      codgrupo: row[2],
      email: row[3] || ''
    }));

    console.log(`[LIBERADORES] Found ${liberadores.length} users matching "${q || '*'}"`);
    return { success: true, liberadores };
  }

  public async defineApprover(nunota: string, codusuLiber: string, codevento: string) {
    const resp = await sankhyaApi.post<any>(
      '/gateway/v1/mgecom/service.sbr?serviceName=GlbConsSolLiberacoesSP.salvarSolicitacoes&outputType=json',
      {
        serviceName: "GlbConsSolLiberacoesSP.salvarSolicitacoes",
        requestBody: {
          solicitacoes: {
            solicitacao: [{
              NUNOTA: { "$": nunota.toString() },
              CODUSULIBER: { "$": codusuLiber.toString() },
              CODEVENTO: { "$": codevento.toString() }
            }]
          }
        }
      }
    );
    const result = resp.data;
    console.log(`[LIBERACOES] Define liberator response:`, JSON.stringify(result).substring(0, 300));
    if (result.status !== "1") throw new Error(result.statusMessage || 'Falha ao definir liberador');
    return { success: true, nunota, codusuLiber, codevento, message: `Liberador ${codusuLiber} definido com sucesso para NUNOTA ${nunota}.` };
  }

  public async getApprovalStatus(nunota: string) {
    const resp = await sankhyaApi.post<any>(
      '/gateway/v1/mgecom/service.sbr?serviceName=GlbConsSolLiberacoesSP.carregarSolicitacoes&outputType=json',
      {
        serviceName: "GlbConsSolLiberacoesSP.carregarSolicitacoes",
        requestBody: { nunota: { "$": nunota.toString() } }
      }
    );
    const result = resp.data;
    if (result.status !== "1") return { success: true, approved: false, dtalibpend: null };

    const solicitacoes = result.responseBody?.solicitacoes?.solicitacao || result.responseBody?.solicitacoes || [];
    const items = Array.isArray(solicitacoes) ? solicitacoes : [solicitacoes];

    const allApproved = items.length > 0 && items.every((s: any) => {
      const dt = s.DTALIBPEND?.$ || s.DTALIBPEND;
      return dt !== null && dt !== undefined && dt !== '';
    });
    const firstApproval = items.find((s: any) => s.DTALIBPEND?.$ || s.DTALIBPEND);
    const dtalibpend = firstApproval ? (firstApproval.DTALIBPEND?.$ || firstApproval.DTALIBPEND) : null;

    return { success: true, nunota, approved: allApproved, dtalibpend, pendingCount: items.filter((s: any) => !(s.DTALIBPEND?.$ || s.DTALIBPEND)).length };
  }

  // ================================================================
  // PEDIDO (Order) Operations
  // ================================================================

  public async getOrderObs(nunota: string) {
    const resp = await sankhyaApi.post<any>('/gateway/v1/mge/service.sbr?serviceName=DbExplorerSP.executeQuery&outputType=json', {
      serviceName: "DbExplorerSP.executeQuery",
      requestBody: { sql: `SELECT OBSERVACAO FROM TGFCAB WHERE NUNOTA = ${nunota}` }
    });
    const obs = resp.data?.responseBody?.rows?.[0]?.[0] || null;
    return { success: true, nunota, obs: fixEncoding(obs), hasObs: !!obs };
  }

  public async saveOrderObs(nunota: string, obs: string) {
    const resp = await sankhyaApi.post<any>(
      '/gateway/v1/mge/service.sbr?serviceName=CRUDServiceProvider.saveRecord&outputType=json',
      {
        serviceName: "CRUDServiceProvider.saveRecord",
        requestBody: {
          dataSet: {
            rootEntity: "CabecalhoNota",
            includePresentationFields: "N",
            dataRow: {
              localFields: {
                OBSERVACAO: { "$": obs }
              },
              key: {
                NUNOTA: { "$": nunota.toString() }
              }
            },
            entity: {
              fieldset: {
                list: "OBSERVACAO"
              }
            }
          }
        }
      }
    );
    if (resp.data.status !== "1") throw new Error(resp.data.statusMessage || 'Falha ao salvar obs');
    console.log(`[PEDIDO OBS] Obs salva com sucesso para NUNOTA ${nunota}`);
    return { success: true, nunota, message: "Observação salva com sucesso." };
  }

  public async attachFileToOrder(nunota: string, fileBase64: string, fileName: string, descricao?: string) {
    const timestamp = Date.now().toString().substring(5); // unique digits
    const sessionKey = `ANEXO_SISTEMA_CabecalhoNota_${nunota}_${timestamp}`;
    const desc = (descricao || 'Pedido Compra').substring(0, 20);

    // ETAPA 1: Upload via sessionUpload.mge
    const cleanBase64 = fileBase64.replace(/^data:[^;]+;base64,/, '');
    const fileBuffer = Buffer.from(cleanBase64, 'base64');

    const FormData = (await import('form-data')).default;
    const formData = new FormData();
    formData.append('arquivo', fileBuffer, { filename: fileName, knownLength: fileBuffer.length });

    const contentLength = formData.getLengthSync();

    console.log(`[PEDIDO ANEXAR] Etapa 1: Upload de ${fileName} (${fileBuffer.length} bytes, CL: ${contentLength})...`);

    await sankhyaApi.post<any>(
      `/gateway/v1/mge/sessionUpload.mge?sessionkey=${sessionKey}&fitem=S&salvar=S&useCache=N`,
      formData,
      { 
        headers: { 
          ...formData.getHeaders(), 
          "Content-Length": contentLength,
          "Accept": "application/json" 
        }, 
        timeout: 30000, 
        maxContentLength: Infinity, 
        maxBodyLength: Infinity 
      }
    );

    // ETAPA 2: Vincular via AnexoSistemaSP.salvar
    console.log(`[PEDIDO ANEXAR] Etapa 2: Vinculando ${fileName} ao NUNOTA ${nunota}...`);

    const salvarResp = await sankhyaApi.post<any>(
      '/gateway/v1/mge/service.sbr?serviceName=AnexoSistemaSP.salvar&outputType=json',
      {
        serviceName: "AnexoSistemaSP.salvar",
        requestBody: {
          params: {
            pkEntity: nunota.toString(), keySession: sessionKey, nameEntity: "CabecalhoNota",
            description: desc, keyAttach: "", typeAcess: "ALL", typeApres: "GLO",
            nuAttach: "", nameAttach: fileName, fileSelect: 1, oldFile: ""
          }
        }
      }
    );

    if (salvarResp.data.status !== "1") throw new Error(salvarResp.data.statusMessage || 'Falha ao vincular anexo');
    return { success: true, nunota, fileName, sessionKey, message: `Arquivo "${fileName}" anexado com sucesso ao NUNOTA ${nunota}.` };
  }

  public async confirmOrder(nunota: string, dealId: string) {
    console.log(`[PEDIDO CONFIRMAR] Confirmando pedido NUNOTA ${nunota} (TOP 1010)...`);

    const resp = await sankhyaApi.post<any>(
      '/gateway/v1/mgecom/service.sbr?serviceName=CACSP.confirmarNota&outputType=json',
      {
        serviceName: "CACSP.confirmarNota",
        requestBody: {
          nota: { NUNOTA: { "$": nunota.toString() } },
          novaDataNeg: { SUBSTITUIRDATA: { "$": "N" } }
        }
      }
    );

    if (resp.data.status !== "1") throw new Error(resp.data.statusMessage || 'Falha ao confirmar pedido');

    // Buscar NRNOTA
    let nrNotaPedido = null;
    try {
      const nrResp = await sankhyaApi.post<any>('/gateway/v1/mge/service.sbr?serviceName=DbExplorerSP.executeQuery&outputType=json', {
        serviceName: "DbExplorerSP.executeQuery",
        requestBody: { sql: `SELECT NUMNOTA FROM TGFCAB WHERE NUNOTA = ${nunota}` }
      });
      nrNotaPedido = nrResp.data?.responseBody?.rows?.[0]?.[0];
    } catch (nrErr: any) {
      console.warn(`[PEDIDO CONFIRMAR] Falha ao buscar NRNOTA: ${nrErr.message}`);
    }

    // Atualizar Deal no HubSpot
    try {
      await hubspotApi.updateDeal(dealId, {
        sankhya_nu_nota_pedido: (nrNotaPedido || nunota).toString(),
        dealstage: 'presentationscheduled'
      });
      console.log(`[PEDIDO CONFIRMAR] Deal ${dealId} atualizado.`);
    } catch (hsErr: any) {
      console.warn(`[PEDIDO CONFIRMAR] Falha ao atualizar Deal: ${hsErr.message}`);
    }

    return {
      success: true, nunota, nrNotaPedido: nrNotaPedido || nunota, dealId,
      dealstage: 'presentationscheduled',
      message: `Pedido ${nunota} confirmado com sucesso!`
    };
  }

  // ================================================================
  // DEAL PROPERTIES (generic update)
  // ================================================================

  public async updateDealProperties(dealId: string, properties: Record<string, any>) {
    console.log(`[DEAL PROPS] Atualizando Deal ${dealId}:`, JSON.stringify(properties));
    await hubspotApi.updateDeal(dealId, properties);
    return { success: true, dealId, properties, message: "Deal atualizado com sucesso." };
  }
}

export const orderService = new OrderService();
