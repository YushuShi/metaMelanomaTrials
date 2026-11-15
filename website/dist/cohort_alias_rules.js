/* Reviewed presentation-only cohort aliases.
 * Exact source/review bindings and literal evidence must match before use.
 * Equal sample sizes alone never authorize an alias. Results and treatment
 * definitions remain in their original records; this supplies identity only.
 * Audit: data/audits/cohort_specificity_20261109/
 */
(function(root,factory){
  if(typeof module==='object'&&module.exports) module.exports=factory();
  else root.CohortAliasRules=factory();
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  return [
  {
    "id": "reviewed-42452684:1:5",
    "pmid": "42452684",
    "samples": [
      "107"
    ],
    "contexts": [
      {
        "stage": "R2",
        "source": "dd28a6d836188cc4a5ab86ab9743be5f57b4aeccc81c106af990dcb139e23e1b",
        "binding": "5e49acc03961fd11f7fbd8d845161dd5d92ed9a72a660107cbbc83326f2e6c78",
        "population": "pop_overall",
        "comparator": null,
        "intervention": "arm_ct"
      },
      {
        "stage": "R3",
        "source": "b25b23d1650f6448a8342426388f79fa30324a669278e7fc7c6a4b68b123aaf7",
        "binding": "36dd1cb33c20ce54bed0a583f8b546d38ea8888e5cc6977637388c3bd9aa0947",
        "population": "pop_r3_ct",
        "comparator": null,
        "intervention": "arm_r3_post_ct"
      }
    ],
    "preferred_context": 1,
    "evidence": [
      {
        "id": "CE-36dd1cb33c20ce54bed0a583-span-2be8e8d476780c78ca3a467a",
        "source_id": "report-b4d49366142576ed3e8e3667:main:d47dd64d1d45b6fe",
        "block_id": "b00045",
        "supporting_quote": "A total of 181 patients with BRAF-negative metastatic melanoma were initially assessed. After excluding patients with incomplete clinical/laboratory data or those who did not receive any systemic treatment following nivolumab progression, a total of 141 patients were included in the study. Among patients who developed disease progression during or after nivolumab treatment, 107 (75.9%) received CT, whereas 34 (24.1%) received IO after progression. The median follow-up duration was 16.4 months (range, 1.8–75.6 months). The demographic and clinical characteristics of the patients are presented in Table 1 ."
      },
      {
        "id": "CE-36dd1cb33c20ce54bed0a583-span-e17af838fc2a0831b65fec98",
        "source_id": "report-b4d49366142576ed3e8e3667:main:d47dd64d1d45b6fe",
        "block_id": "b00021",
        "supporting_quote": "Systemic treatments administered following nivolumab progression were categorized into two main groups according to treatment modality: CT and IO-based treatments. Treatment classification was based on the first systemic therapy administered after nivolumab progression."
      }
    ],
    "reason": "The two exact post-nivolumab treatment cohorts are explicitly 107 chemotherapy and 34 immunotherapy recipients."
  },
  {
    "id": "reviewed-42452684:2:6",
    "pmid": "42452684",
    "samples": [
      "34"
    ],
    "contexts": [
      {
        "stage": "R2",
        "source": "dd28a6d836188cc4a5ab86ab9743be5f57b4aeccc81c106af990dcb139e23e1b",
        "binding": "5e49acc03961fd11f7fbd8d845161dd5d92ed9a72a660107cbbc83326f2e6c78",
        "population": "pop_overall",
        "comparator": null,
        "intervention": "arm_io"
      },
      {
        "stage": "R3",
        "source": "b25b23d1650f6448a8342426388f79fa30324a669278e7fc7c6a4b68b123aaf7",
        "binding": "36dd1cb33c20ce54bed0a583f8b546d38ea8888e5cc6977637388c3bd9aa0947",
        "population": "pop_r3_io",
        "comparator": null,
        "intervention": "arm_r3_post_io"
      }
    ],
    "preferred_context": 1,
    "evidence": [
      {
        "id": "CE-36dd1cb33c20ce54bed0a583-span-2be8e8d476780c78ca3a467a",
        "source_id": "report-b4d49366142576ed3e8e3667:main:d47dd64d1d45b6fe",
        "block_id": "b00045",
        "supporting_quote": "A total of 181 patients with BRAF-negative metastatic melanoma were initially assessed. After excluding patients with incomplete clinical/laboratory data or those who did not receive any systemic treatment following nivolumab progression, a total of 141 patients were included in the study. Among patients who developed disease progression during or after nivolumab treatment, 107 (75.9%) received CT, whereas 34 (24.1%) received IO after progression. The median follow-up duration was 16.4 months (range, 1.8–75.6 months). The demographic and clinical characteristics of the patients are presented in Table 1 ."
      },
      {
        "id": "CE-36dd1cb33c20ce54bed0a583-span-e17af838fc2a0831b65fec98",
        "source_id": "report-b4d49366142576ed3e8e3667:main:d47dd64d1d45b6fe",
        "block_id": "b00021",
        "supporting_quote": "Systemic treatments administered following nivolumab progression were categorized into two main groups according to treatment modality: CT and IO-based treatments. Treatment classification was based on the first systemic therapy administered after nivolumab progression."
      }
    ],
    "reason": "The two exact post-nivolumab treatment cohorts are explicitly 107 chemotherapy and 34 immunotherapy recipients."
  },
  {
    "id": "reviewed-40106536:1:13",
    "pmid": "40106536",
    "samples": [
      "75"
    ],
    "contexts": [
      {
        "stage": "R2",
        "source": "c6848a45d991b1d25fa903f56815af4b47560c5a9d406acc3de3137b1898cc2b",
        "binding": "457125768129a1a73ca707b1fd0ae8704d933a91e958943cd5dfba230a888dea",
        "population": "p2",
        "comparator": null,
        "intervention": "a1"
      },
      {
        "stage": "R3",
        "source": "6205ecf00d2c9141d95b5d9cea95a049bf63b109f0ba7f1db07089b3c4874038",
        "binding": "e2043689394463b40d7668d5b46cdcf54f920c373429c57f270807a1194d2943",
        "population": "p9",
        "comparator": null,
        "intervention": "a2"
      }
    ],
    "preferred_context": 1,
    "evidence": [
      {
        "id": "CE-e2043689394463b40d7668d5-span-8b3c3d88856c52640252237b",
        "source_id": "report-53441bf5de6a5cfe26e62a85:main:cfe97f83c0b74c5a",
        "block_id": "b00035",
        "supporting_quote": "One hundred and fifty-eight patients were enrolled (first patient first visit: July 23, 2014; last patient first visit: March 14, 2018; last patient last visit: January 13, 2023) and treated with encorafenib plus binimetinib in part I/run-in of the study; 75 patients had not previously received BRAFi/MEKi (naïve), and 83 patients had received BRAFi/MEKi (other than encorafenib plus binimetinib) previously (pretreated). Fifty-eight patients were enrolled in part II and received study treatment; 38 patients were treated with encorafenib plus binimetinib and ribociclib, 1 with encorafenib plus binimetinib and infigratinib, 13 with encorafenib plus binimetinib and capmatinib, and 6 with encorafenib plus binimetinib and buparlisib ( Table 1 ). Prior phase I studies comparing the triplet combinations of encorafenib plus binimetinib plus ribociclib, infigratinib, buparlisib, or capmatinib have not been completed in this setting. The buparlisib arm was closed during the study because of drug–drug interactions with encorafenib. The one patient in the infigratinib triplet died because of PD, corresponding to an OS of 20.8 months."
      },
      {
        "id": "CE-e2043689394463b40d7668d5-span-d8ee0ef1806ec112be15e466",
        "source_id": "report-53441bf5de6a5cfe26e62a85:main:cfe97f83c0b74c5a",
        "block_id": "b00049",
        "supporting_quote": "Table 3.\nChange in ctDNA BRAF V600E : BRAFi/MEKi naïve vs. pretreated.\n | Total participants , n | Overall response, n (%) | 95% CI a\nBRAFi/MEKi naïve |  |  | \nAll BRAFi/MEKi naïve | 75 | 55 (73.3) | 61.9–82.9\nBRAF V600E –NMD | 39 | 32 (82.1) | 66.5–92.5\nBRAF V600E – BRAF V600E | 10 | 6 (60.0) | 26.2–87.8\nPrior BRAFi or MEKi therapy |  |  | \nAll prior BRAFi or MEKi | 78 | 20 (25.6) | 16.4–36.8\nBRAF V600E –NMD | 12 | 8 (66.7) | 34.9–90.1\nBRAF V600E – BRAF V600E | 27 | 4 (14.8) | 4.2–33.7\nBRAF V600E –NMD indicates that BRAF V600E ctDNA was detected at baseline and not at cycle 1 day 15. a The 95% CI for the frequency distribution of each variable was computed using the Clopper–Pearson method."
      }
    ],
    "reason": "The BRAFi/MEKi-naive run-in cohort is75; ctDNA table explicitly labels all75 naive participants, so this is not a distinct subset."
  },
  {
    "id": "reviewed-40106536:3:9",
    "pmid": "40106536",
    "samples": [
      "38"
    ],
    "contexts": [
      {
        "stage": "R2",
        "source": "c6848a45d991b1d25fa903f56815af4b47560c5a9d406acc3de3137b1898cc2b",
        "binding": "457125768129a1a73ca707b1fd0ae8704d933a91e958943cd5dfba230a888dea",
        "population": "p4",
        "comparator": null,
        "intervention": "a2"
      },
      {
        "stage": "R3",
        "source": "6205ecf00d2c9141d95b5d9cea95a049bf63b109f0ba7f1db07089b3c4874038",
        "binding": "e2043689394463b40d7668d5b46cdcf54f920c373429c57f270807a1194d2943",
        "population": "p5",
        "comparator": null,
        "intervention": "a4"
      }
    ],
    "preferred_context": 1,
    "evidence": [
      {
        "id": "CE-e2043689394463b40d7668d5-span-35ca153820c9e44c3f58279b",
        "source_id": "report-53441bf5de6a5cfe26e62a85:main:cfe97f83c0b74c5a",
        "block_id": "b00016",
        "supporting_quote": "Tumor biopsies at baseline and on PD were sequenced using technologies such as NGS. Based on the changes in genomic alterations observed in tumor tissue biopsies obtained at baseline and at PD, patients were assigned to one of four treatment arms in part II of the study. Patients continued to receive encorafenib plus binimetinib in addition to a third individually selected molecularly targeted agent (triplet combinations); ribociclib [cyclin-dependent kinase (CDK) 4 and 6 inhibitor] was given at the previously defined MTD, whereas dose escalations were used in the infigratinib (FGFR inhibitor), capmatinib (MET-targeting kinase inhibitor), and buparlisib (PI3K inhibitor) arms. Patients with CCND1 amplification, CDK4 amplification or mutation, B/CRAF amplification, MAP2K1/K2 mutation, N/K/HRAS mutation, P16 loss, or no alterations in any genes mentioned for any of the following arms received encorafenib (200 mg once daily) plus binimetinib (45 mg twice daily) and ribociclib (600 mg once daily, given 3 weeks on/1 week off). Patients with HER2 amplification, IGF-1R amplification, EGFR amplification or mutation, PIK3CA mutation, or PTEN mutation or loss received encorafenib (450 mg once daily) plus binimetinib (45 mg twice daily) and buparlisib (60 or 90 mg, once daily). Patients with cMET amplification received encorafenib (200 mg once daily) plus binimetinib (45 mg twice daily) and capmatinib (200, 300, 400, or 600 mg once daily). Patients with FGFR1/2/3 amplifications or mutations received encorafenib (450 mg once daily) plus binimetinib (45 mg twice daily) and infigratinib (75 mg, once daily). If no relevant alteration was identified, the investigator, in discussion with the medical monitor and biomarker lead, assigned patients to the group deemed most appropriate for the patient."
      },
      {
        "id": "CE-e2043689394463b40d7668d5-span-8b3c3d88856c52640252237b",
        "source_id": "report-53441bf5de6a5cfe26e62a85:main:cfe97f83c0b74c5a",
        "block_id": "b00035",
        "supporting_quote": "One hundred and fifty-eight patients were enrolled (first patient first visit: July 23, 2014; last patient first visit: March 14, 2018; last patient last visit: January 13, 2023) and treated with encorafenib plus binimetinib in part I/run-in of the study; 75 patients had not previously received BRAFi/MEKi (naïve), and 83 patients had received BRAFi/MEKi (other than encorafenib plus binimetinib) previously (pretreated). Fifty-eight patients were enrolled in part II and received study treatment; 38 patients were treated with encorafenib plus binimetinib and ribociclib, 1 with encorafenib plus binimetinib and infigratinib, 13 with encorafenib plus binimetinib and capmatinib, and 6 with encorafenib plus binimetinib and buparlisib ( Table 1 ). Prior phase I studies comparing the triplet combinations of encorafenib plus binimetinib plus ribociclib, infigratinib, buparlisib, or capmatinib have not been completed in this setting. The buparlisib arm was closed during the study because of drug–drug interactions with encorafenib. The one patient in the infigratinib triplet died because of PD, corresponding to an OS of 20.8 months."
      }
    ],
    "reason": "Part-II triplet arms are explicitly ribociclib38, infigratinib1, capmatinib13 and buparlisib6; refined group labels identify the same arm cohorts."
  },
  {
    "id": "reviewed-40106536:4:12",
    "pmid": "40106536",
    "samples": [
      "1"
    ],
    "contexts": [
      {
        "stage": "R2",
        "source": "c6848a45d991b1d25fa903f56815af4b47560c5a9d406acc3de3137b1898cc2b",
        "binding": "457125768129a1a73ca707b1fd0ae8704d933a91e958943cd5dfba230a888dea",
        "population": "p4",
        "comparator": null,
        "intervention": "a3"
      },
      {
        "stage": "R3",
        "source": "6205ecf00d2c9141d95b5d9cea95a049bf63b109f0ba7f1db07089b3c4874038",
        "binding": "e2043689394463b40d7668d5b46cdcf54f920c373429c57f270807a1194d2943",
        "population": "p6",
        "comparator": null,
        "intervention": "a5"
      }
    ],
    "preferred_context": 1,
    "evidence": [
      {
        "id": "CE-e2043689394463b40d7668d5-span-35ca153820c9e44c3f58279b",
        "source_id": "report-53441bf5de6a5cfe26e62a85:main:cfe97f83c0b74c5a",
        "block_id": "b00016",
        "supporting_quote": "Tumor biopsies at baseline and on PD were sequenced using technologies such as NGS. Based on the changes in genomic alterations observed in tumor tissue biopsies obtained at baseline and at PD, patients were assigned to one of four treatment arms in part II of the study. Patients continued to receive encorafenib plus binimetinib in addition to a third individually selected molecularly targeted agent (triplet combinations); ribociclib [cyclin-dependent kinase (CDK) 4 and 6 inhibitor] was given at the previously defined MTD, whereas dose escalations were used in the infigratinib (FGFR inhibitor), capmatinib (MET-targeting kinase inhibitor), and buparlisib (PI3K inhibitor) arms. Patients with CCND1 amplification, CDK4 amplification or mutation, B/CRAF amplification, MAP2K1/K2 mutation, N/K/HRAS mutation, P16 loss, or no alterations in any genes mentioned for any of the following arms received encorafenib (200 mg once daily) plus binimetinib (45 mg twice daily) and ribociclib (600 mg once daily, given 3 weeks on/1 week off). Patients with HER2 amplification, IGF-1R amplification, EGFR amplification or mutation, PIK3CA mutation, or PTEN mutation or loss received encorafenib (450 mg once daily) plus binimetinib (45 mg twice daily) and buparlisib (60 or 90 mg, once daily). Patients with cMET amplification received encorafenib (200 mg once daily) plus binimetinib (45 mg twice daily) and capmatinib (200, 300, 400, or 600 mg once daily). Patients with FGFR1/2/3 amplifications or mutations received encorafenib (450 mg once daily) plus binimetinib (45 mg twice daily) and infigratinib (75 mg, once daily). If no relevant alteration was identified, the investigator, in discussion with the medical monitor and biomarker lead, assigned patients to the group deemed most appropriate for the patient."
      },
      {
        "id": "CE-e2043689394463b40d7668d5-span-8b3c3d88856c52640252237b",
        "source_id": "report-53441bf5de6a5cfe26e62a85:main:cfe97f83c0b74c5a",
        "block_id": "b00035",
        "supporting_quote": "One hundred and fifty-eight patients were enrolled (first patient first visit: July 23, 2014; last patient first visit: March 14, 2018; last patient last visit: January 13, 2023) and treated with encorafenib plus binimetinib in part I/run-in of the study; 75 patients had not previously received BRAFi/MEKi (naïve), and 83 patients had received BRAFi/MEKi (other than encorafenib plus binimetinib) previously (pretreated). Fifty-eight patients were enrolled in part II and received study treatment; 38 patients were treated with encorafenib plus binimetinib and ribociclib, 1 with encorafenib plus binimetinib and infigratinib, 13 with encorafenib plus binimetinib and capmatinib, and 6 with encorafenib plus binimetinib and buparlisib ( Table 1 ). Prior phase I studies comparing the triplet combinations of encorafenib plus binimetinib plus ribociclib, infigratinib, buparlisib, or capmatinib have not been completed in this setting. The buparlisib arm was closed during the study because of drug–drug interactions with encorafenib. The one patient in the infigratinib triplet died because of PD, corresponding to an OS of 20.8 months."
      }
    ],
    "reason": "Part-II triplet arms are explicitly ribociclib38, infigratinib1, capmatinib13 and buparlisib6; refined group labels identify the same arm cohorts."
  },
  {
    "id": "reviewed-40106536:5:10",
    "pmid": "40106536",
    "samples": [
      "13"
    ],
    "contexts": [
      {
        "stage": "R2",
        "source": "c6848a45d991b1d25fa903f56815af4b47560c5a9d406acc3de3137b1898cc2b",
        "binding": "457125768129a1a73ca707b1fd0ae8704d933a91e958943cd5dfba230a888dea",
        "population": "p4",
        "comparator": null,
        "intervention": "a4"
      },
      {
        "stage": "R3",
        "source": "6205ecf00d2c9141d95b5d9cea95a049bf63b109f0ba7f1db07089b3c4874038",
        "binding": "e2043689394463b40d7668d5b46cdcf54f920c373429c57f270807a1194d2943",
        "population": "p7",
        "comparator": null,
        "intervention": "a6"
      }
    ],
    "preferred_context": 1,
    "evidence": [
      {
        "id": "CE-e2043689394463b40d7668d5-span-35ca153820c9e44c3f58279b",
        "source_id": "report-53441bf5de6a5cfe26e62a85:main:cfe97f83c0b74c5a",
        "block_id": "b00016",
        "supporting_quote": "Tumor biopsies at baseline and on PD were sequenced using technologies such as NGS. Based on the changes in genomic alterations observed in tumor tissue biopsies obtained at baseline and at PD, patients were assigned to one of four treatment arms in part II of the study. Patients continued to receive encorafenib plus binimetinib in addition to a third individually selected molecularly targeted agent (triplet combinations); ribociclib [cyclin-dependent kinase (CDK) 4 and 6 inhibitor] was given at the previously defined MTD, whereas dose escalations were used in the infigratinib (FGFR inhibitor), capmatinib (MET-targeting kinase inhibitor), and buparlisib (PI3K inhibitor) arms. Patients with CCND1 amplification, CDK4 amplification or mutation, B/CRAF amplification, MAP2K1/K2 mutation, N/K/HRAS mutation, P16 loss, or no alterations in any genes mentioned for any of the following arms received encorafenib (200 mg once daily) plus binimetinib (45 mg twice daily) and ribociclib (600 mg once daily, given 3 weeks on/1 week off). Patients with HER2 amplification, IGF-1R amplification, EGFR amplification or mutation, PIK3CA mutation, or PTEN mutation or loss received encorafenib (450 mg once daily) plus binimetinib (45 mg twice daily) and buparlisib (60 or 90 mg, once daily). Patients with cMET amplification received encorafenib (200 mg once daily) plus binimetinib (45 mg twice daily) and capmatinib (200, 300, 400, or 600 mg once daily). Patients with FGFR1/2/3 amplifications or mutations received encorafenib (450 mg once daily) plus binimetinib (45 mg twice daily) and infigratinib (75 mg, once daily). If no relevant alteration was identified, the investigator, in discussion with the medical monitor and biomarker lead, assigned patients to the group deemed most appropriate for the patient."
      },
      {
        "id": "CE-e2043689394463b40d7668d5-span-8b3c3d88856c52640252237b",
        "source_id": "report-53441bf5de6a5cfe26e62a85:main:cfe97f83c0b74c5a",
        "block_id": "b00035",
        "supporting_quote": "One hundred and fifty-eight patients were enrolled (first patient first visit: July 23, 2014; last patient first visit: March 14, 2018; last patient last visit: January 13, 2023) and treated with encorafenib plus binimetinib in part I/run-in of the study; 75 patients had not previously received BRAFi/MEKi (naïve), and 83 patients had received BRAFi/MEKi (other than encorafenib plus binimetinib) previously (pretreated). Fifty-eight patients were enrolled in part II and received study treatment; 38 patients were treated with encorafenib plus binimetinib and ribociclib, 1 with encorafenib plus binimetinib and infigratinib, 13 with encorafenib plus binimetinib and capmatinib, and 6 with encorafenib plus binimetinib and buparlisib ( Table 1 ). Prior phase I studies comparing the triplet combinations of encorafenib plus binimetinib plus ribociclib, infigratinib, buparlisib, or capmatinib have not been completed in this setting. The buparlisib arm was closed during the study because of drug–drug interactions with encorafenib. The one patient in the infigratinib triplet died because of PD, corresponding to an OS of 20.8 months."
      }
    ],
    "reason": "Part-II triplet arms are explicitly ribociclib38, infigratinib1, capmatinib13 and buparlisib6; refined group labels identify the same arm cohorts."
  },
  {
    "id": "reviewed-40106536:6:11",
    "pmid": "40106536",
    "samples": [
      "6"
    ],
    "contexts": [
      {
        "stage": "R2",
        "source": "c6848a45d991b1d25fa903f56815af4b47560c5a9d406acc3de3137b1898cc2b",
        "binding": "457125768129a1a73ca707b1fd0ae8704d933a91e958943cd5dfba230a888dea",
        "population": "p4",
        "comparator": null,
        "intervention": "a5"
      },
      {
        "stage": "R3",
        "source": "6205ecf00d2c9141d95b5d9cea95a049bf63b109f0ba7f1db07089b3c4874038",
        "binding": "e2043689394463b40d7668d5b46cdcf54f920c373429c57f270807a1194d2943",
        "population": "p8",
        "comparator": null,
        "intervention": "a7"
      }
    ],
    "preferred_context": 1,
    "evidence": [
      {
        "id": "CE-e2043689394463b40d7668d5-span-35ca153820c9e44c3f58279b",
        "source_id": "report-53441bf5de6a5cfe26e62a85:main:cfe97f83c0b74c5a",
        "block_id": "b00016",
        "supporting_quote": "Tumor biopsies at baseline and on PD were sequenced using technologies such as NGS. Based on the changes in genomic alterations observed in tumor tissue biopsies obtained at baseline and at PD, patients were assigned to one of four treatment arms in part II of the study. Patients continued to receive encorafenib plus binimetinib in addition to a third individually selected molecularly targeted agent (triplet combinations); ribociclib [cyclin-dependent kinase (CDK) 4 and 6 inhibitor] was given at the previously defined MTD, whereas dose escalations were used in the infigratinib (FGFR inhibitor), capmatinib (MET-targeting kinase inhibitor), and buparlisib (PI3K inhibitor) arms. Patients with CCND1 amplification, CDK4 amplification or mutation, B/CRAF amplification, MAP2K1/K2 mutation, N/K/HRAS mutation, P16 loss, or no alterations in any genes mentioned for any of the following arms received encorafenib (200 mg once daily) plus binimetinib (45 mg twice daily) and ribociclib (600 mg once daily, given 3 weeks on/1 week off). Patients with HER2 amplification, IGF-1R amplification, EGFR amplification or mutation, PIK3CA mutation, or PTEN mutation or loss received encorafenib (450 mg once daily) plus binimetinib (45 mg twice daily) and buparlisib (60 or 90 mg, once daily). Patients with cMET amplification received encorafenib (200 mg once daily) plus binimetinib (45 mg twice daily) and capmatinib (200, 300, 400, or 600 mg once daily). Patients with FGFR1/2/3 amplifications or mutations received encorafenib (450 mg once daily) plus binimetinib (45 mg twice daily) and infigratinib (75 mg, once daily). If no relevant alteration was identified, the investigator, in discussion with the medical monitor and biomarker lead, assigned patients to the group deemed most appropriate for the patient."
      },
      {
        "id": "CE-e2043689394463b40d7668d5-span-8b3c3d88856c52640252237b",
        "source_id": "report-53441bf5de6a5cfe26e62a85:main:cfe97f83c0b74c5a",
        "block_id": "b00035",
        "supporting_quote": "One hundred and fifty-eight patients were enrolled (first patient first visit: July 23, 2014; last patient first visit: March 14, 2018; last patient last visit: January 13, 2023) and treated with encorafenib plus binimetinib in part I/run-in of the study; 75 patients had not previously received BRAFi/MEKi (naïve), and 83 patients had received BRAFi/MEKi (other than encorafenib plus binimetinib) previously (pretreated). Fifty-eight patients were enrolled in part II and received study treatment; 38 patients were treated with encorafenib plus binimetinib and ribociclib, 1 with encorafenib plus binimetinib and infigratinib, 13 with encorafenib plus binimetinib and capmatinib, and 6 with encorafenib plus binimetinib and buparlisib ( Table 1 ). Prior phase I studies comparing the triplet combinations of encorafenib plus binimetinib plus ribociclib, infigratinib, buparlisib, or capmatinib have not been completed in this setting. The buparlisib arm was closed during the study because of drug–drug interactions with encorafenib. The one patient in the infigratinib triplet died because of PD, corresponding to an OS of 20.8 months."
      }
    ],
    "reason": "Part-II triplet arms are explicitly ribociclib38, infigratinib1, capmatinib13 and buparlisib6; refined group labels identify the same arm cohorts."
  },
  {
    "id": "reviewed-41396687:1:3",
    "pmid": "41396687",
    "samples": [
      "21"
    ],
    "contexts": [
      {
        "stage": "R2",
        "source": "10f28bc24db4a5127342159ee806923154732a398d6c810ceda8a95a49f094a2",
        "binding": "8150a6a393f0af882a3abe8b4294775c8e3989fe72a11ff4a2dfe951b106ec75",
        "population": "p-melanoma",
        "comparator": null,
        "intervention": "a-ici"
      },
      {
        "stage": "R3",
        "source": "a070b27ef3e96f1f96ee1c81a4a799f73ce1be9d2c8f6b4f63b510570c260a01",
        "binding": "14dbdca356cb003e7214e31fa52868e64b114e6e5802b69272926172ddb7d5a1",
        "population": "p-advanced",
        "comparator": null,
        "intervention": "a-advanced-ici"
      }
    ],
    "preferred_context": 1,
    "evidence": [
      {
        "id": "CE-14dbdca356cb003e7214e31f-span-9022102bcfcbad96fdbacb3f",
        "source_id": "report-74df87d19caac1821993242c:main:14739796b9ff6c7d",
        "block_id": "b00029",
        "supporting_quote": "Among the 35 patients with melanoma, the primary tumour was predominantly cutaneous (31/35, 89%). Four patients had previously received systemic anti-BRAF plus anti-MEK therapy. At the time of first ICI initiation, 2 patients (5.7%) were at stage II, 12 (34.3%) at stage III, and 21 (60.0%) at stage IV or had unresectable stage III disease. In the latter group, 4 patients had previously received anti-BRAF plus anti-MEK therapy. In this setting, irrespective of the number of treatment lines, the median ICI treatment duration was 280 days (IQR, 133; 643). Nine patients (25.7%) received their first ICI in the adjuvant setting, and 5 patients (14.3%) in the neoadjuvant stage III setting ( Figure 1 ). Considering the different lines of treatment administered over time, 17 patients received at least one infusion of NIVO+IPI. Among the 18 melanoma patients who were never exposed to this combination, one received ipilimumab monotherapy, while the remaining patients were all treated with anti-PD-1 monotherapy, combined with Lenvatinib in one patient. Tumour outcomes following first-line ICI in patients with stage IV or unresectable stage III disease were: complete response in 4/21 (19.0%), partial response in 5/21 (23.8%), and progression in 12/21 (57.1%). In the adjuvant group (n = 9), two patients experienced disease relapse at the last follow-up. In the neoadjuvant group (n = 5), one patient achieved a complete pathological response, while the remaining four progressed and were subsequently treated with NIVO+IPI."
      },
      {
        "id": "CE-8150a6a393f0af882a3abe8b-span-57f33808d5fa578462bf1df5",
        "source_id": "report-74df87d19caac1821993242c:citation",
        "block_id": "abstract",
        "supporting_quote": "RESULTS: Among the 54 patients, 89% were male, and 92.6% had a suppressed HIV viral load. Melanoma was the most frequent tumour (35/54, 64.8%), followed by cutaneous squamous cell carcinoma (12/54, 22.2%), Kaposi sarcoma (4/54, 7.4%), basal cell carcinoma (2/54, 3.7%), and one Merkel cell carcinoma. Anti-PD-1/PD-L1 monotherapy was given as first-line treatment in 81.5% (44/54). Immune-related adverse events (irAEs) occurred in 42.6% (23/54), with a median onset of 43.5 days (IQR, 20.5-126). The maximum toxicity grade was 1/2 in 39% (21/54), grade ≥ 3 in 13% (7/54). Seventeen melanoma patients received NIVO+IPI. Among them, 64.7% (11/17) experienced irAEs, including grade ≥ 3 events in 30% (5/17). Objective response rates were 43% (9/21) in melanoma, 58% (7/12) in cSCC, and 75% (3/4) in Kaposi sarcoma.\n"
      }
    ],
    "reason": "Abstract ORR9/21 is the full-text first-line stageIV/unresectableIII response cohort21; retain HIV context, not an implication that all35 melanoma participants belong to this result cohort.",
    "group_label": "HIV-positive; first-line advanced melanoma"
  },
  {
    "id": "reviewed-39816915:2:4",
    "pmid": "39816915",
    "samples": [
      "9"
    ],
    "contexts": [
      {
        "stage": "R2",
        "source": "906520f53f7c807a3ec26f84c0bb1f1ff085c5e81540d72f09cee1fb7d67aa33",
        "binding": "51b3873042c0bfc2f3e82b006f3efa11b488abd8222696923f078e437215c3e2",
        "population": "p_all",
        "comparator": null,
        "intervention": "a_p"
      },
      {
        "stage": "R3",
        "source": "0d8835cec7ee14ed1bd5677b258e9c562bef1e20f9d013acb196ce25024f32c4",
        "binding": "3d58eeb14d387bc4fce9bbf55074a574360ac6c5642b48b17f9ece360960da4e",
        "population": "p_eval",
        "comparator": null,
        "intervention": "a_p"
      }
    ],
    "preferred_context": 1,
    "evidence": [
      {
        "id": "CE-3d58eeb14d387bc4fce9bbf5-span-134244a2a15f13b6377fb2c9",
        "source_id": "report-22699492eab3c962e45d29f8:main:00d299f2b1ac210b",
        "block_id": "b00022",
        "supporting_quote": "By the time of data cutoff in August 2023, nine patients were evaluable for response. One patient was not evaluable because of early discontinuation due to toxicity before sufficient dosing. Among the nine patients with evaluable disease, all were treated with selinexor in combination with pembrolizumab, and the best response was stable disease (SD) in eight patients (89%) and progressive disease (PD) in one patient (11%) ( Table 4 ; Fig. 1 ). In patients with non-PD, the duration of stable disease ranged from 1–30 months, with a median of 5 months (Supplementary Fig. 1). Five patients (55%) experienced tumor regression in their target lesion(s) ( Fig. 1 )."
      },
      {
        "id": "CE-3d58eeb14d387bc4fce9bbf5-span-6f188ba0badefacea8e5b04e",
        "source_id": "report-22699492eab3c962e45d29f8:main:00d299f2b1ac210b",
        "block_id": "b00014",
        "supporting_quote": "We included 10 patients with uveal melanoma who had a median age of 61.1 (range 31–67). Nine patients received treatment with selinexor plus pembrolizumab, and one received treatment with selinexor plus nivolumab and ipilimumab. Six patients (60%) were treatment naïve, and four patients (40%) had received prior treatment with PD1-based therapy for metastatic disease ( Table 1 ). In the four pretreated patients, three (75%) had a PD-1 therapy backbone as the most recent treatment before trial enrollment."
      },
      {
        "id": "CE-51b3873042c0bfc2f3e82b00-span-98718f79f9e7cd296aba9d6a",
        "source_id": "report-22699492eab3c962e45d29f8:citation",
        "block_id": "abstract",
        "supporting_quote": "RESULTS: We included 10 patients with uveal melanoma who received treatment with either selinexor plus pembrolizumab (n = 9) or selinexor plus nivolumab and ipilimumab (n = 1). The most common adverse events of any grade were neutropenia, thrombocytopenia, leukopenia, and anemia. Additional common nonhematological toxicities included hyponatremia, nausea, and vomiting. Dose reductions were required in six patients (60%). Among nine patients with evaluable disease, eight had stable disease as the best response. The median progression-free and overall survival were 6 months (95% CI: 4, not reached and 17 months (95% CI: 7, not reached), respectively.\n"
      }
    ],
    "reason": "All nine response-evaluable patients received selinexor plus pembrolizumab; they are the nine treated with that regimen."
  },
  {
    "id": "reviewed-38793023:1:2",
    "pmid": "38793023",
    "samples": [
      "99"
    ],
    "contexts": [
      {
        "stage": "R2",
        "source": "4c69944424cd6c596be41a6d6d7298e406d3cda48bb3d239a4d9a079fd5d77f9",
        "binding": "24d30866451f3fed1bf2f4bcf1fc67abb070f16a98a8b70c38ee83bd016d903f",
        "population": "p1",
        "comparator": null,
        "intervention": "a1"
      },
      {
        "stage": "R3",
        "source": "591d64b049dc6f73a5676ee8f438f3e3bfe0712b051e47cd7c510c7846a77cdb",
        "binding": "1be7492c288d9500227ceca5c1c33b49b93753ce5f76da2b7639a7d5ca95b6ff",
        "population": "p2",
        "comparator": null,
        "intervention": "a1"
      }
    ],
    "preferred_context": 1,
    "evidence": [
      {
        "id": "CE-1be7492c288d9500227ceca5-span-4d8d80e9024b82ff41723b9d",
        "source_id": "report-2eb4860e79231c6b5abaa9fa:main:845cd055859122be",
        "block_id": "b00002",
        "supporting_quote": "Background: Isolated limb hyperthermic-antiblastic perfusion (ILP) was the most effective local treatment for advanced in-transit melanoma, but the advent of modern effective immunotherapy (IT), such as immune checkpoint inhibitors, has changed the treatment landscape. Methods: This study evaluated the role of the association between ILP and IT in the treatment of locally advanced unresectable melanoma, particularly in relation to modern systemic therapies. We analyzed 187 consecutive patients who were treated with ILP (melphalan or melphalan associated with TNF-alpha) for advanced melanoma at the Veneto Institute of Oncology of Padua (Italy) and the Padua University Hospital (Italy) between June 1989 and September 2021. Overall survival (OS), disease-specific survival (DSS), local disease-free survival (local DFS) and distant disease-free survival (distant DFS) were evaluated. Local toxicity was classified according to the Wieberdink scale and surgical complications according to the Clavien–Dindo classification. Response to locoregional therapy was evaluated during follow-up according to the RECIST 1.1 criteria (Response Evaluation Criteria in Solid Tumor). Results: A total of 99 patients were treated with ILP and 88 with IT + ILP. The overall response rate was 67% in both groups. At 36 months, OS was 43% in the ILP group and 61% in the ILP + IT group ( p = 0.02); DSS was 43% in the ILP group and 64% in the ILP + IT group ( p = 0.02); local DFS was the 37% in ILP group and 53% in the ILP + IT group ( p = 0.04); and distant DFS was 33% in the ILP group and 35% in the ILP + IT group ( p = 0.40). Adjusting for age and lymph node involvement, receiving ILP + IT was associated with improved OS ( p = 0.01) and DSS ( p = 0.007) but not local DFS ( p = 0.13) and distant DFS ( p = 0.21). Conclusions: Our findings confirm the synergy between ILP and IT. ILP remains a valuable loco-regional treatment option in the era of effective systemic treatments. Further studies are needed to establish the optimal combination of loco-regional and systemic treatments and address the best timing of this combination to obtain the highest local response rate."
      },
      {
        "id": "CE-1be7492c288d9500227ceca5-span-5284c3a09f2a83e94cbd26b8",
        "source_id": "report-2eb4860e79231c6b5abaa9fa:main:845cd055859122be",
        "block_id": "b00019",
        "supporting_quote": "Overall, 187 patients fulfilled the inclusion criteria (99 treated with ILP and 88 treated with IT + ILP) and were included in the analysis. Demographics, tumor characteristics and treatment information are reported in Table 1 . IT included IFN ( n = 59), ICI ( n = 12) or both ( n = 17)."
      }
    ],
    "reason": "The99 ILP-only patients are the source-defined melphalan with/without TNF-alpha cohort; refine the broad population label to ILP-only."
  },
  {
    "id": "reviewed-38529706:1:3",
    "pmid": "38529706",
    "samples": [
      "37"
    ],
    "contexts": [
      {
        "stage": "R2",
        "source": "36747579574587697ba23ecad3b1279346e8a92e4ff4d004d26ad5a121619f42",
        "binding": "eb9072496af84214825f8154835cbb657b89ec30135c3dca4c9d05bd3b7ede9e",
        "population": "p1",
        "comparator": null,
        "intervention": "a1"
      },
      {
        "stage": "R3",
        "source": "f6cf21e983e0b6b013a450aa2a9d9412d90a84d22a21def92bdf87c6dc1d784d",
        "binding": "766660ea16d1366e96496c519bb80a4dc03ea5b03dc1ae2b358dc9e3aedb4e36",
        "population": "rp6",
        "comparator": null,
        "intervention": "ra1"
      }
    ],
    "preferred_context": 1,
    "evidence": [
      {
        "id": "CE-766660ea16d1366e96496c51-span-4177f9a8332a55efe9e78f76",
        "source_id": "report-effc6fa20ec8de55b9f33261:main:9b3b4c6353969801",
        "block_id": "b00036",
        "supporting_quote": "Of the 42 patients enrolled, five were excluded from the efficacy analyses because of the absence of measurable lesions at baseline according to central review. Thirty‐seven patients were therefore evaluable for tumor response: 29 had cutaneous melanoma and eight had mucosal melanoma. Of the 37 patients evaluable for response, four achieved CR and five achieved partial response (PR), for an ORR of 24.3% (95% CI, 11.8–41.2) (Table 2 ). Two patients who had PR at the time of the initial analysis had achieved a CR at the time of the final analysis. Eighteen patients had disease control (CR, PR, or stable disease [SD]) for a disease control rate of 48.6% (95% CI, 31.9–65.6) (Table 2 )."
      },
      {
        "id": "CE-eb9072496af84214825f8154-span-308209564ecc999e1889da18",
        "source_id": "report-effc6fa20ec8de55b9f33261:citation",
        "block_id": "abstract",
        "supporting_quote": "Pembrolizumab demonstrated an acceptable safety profile and promising antitumor activity in Japanese patients with advanced melanoma in the phase 1b KEYNOTE-041 (Study of Pembrolizumab [MK-3475] in Participants With Advanced Melanoma) trial. To evaluate the long-term efficacy and safety of pembrolizumab in Japanese patients with advanced melanoma in KEYNOTE-041. The current analysis reports results of additional follow-up of approximately 12 months since the initial analysis. Eligible patients had locally advanced (unresectable stage III) or metastatic (stage IV) melanoma not amenable to local therapy and had received two or fewer prior systemic therapies. Pembrolizumab 2 mg/kg was given every 3 weeks for up to 2 years or until confirmed progression or unacceptable toxicity. Primary end points included safety, tolerability, and overall response rate (ORR) per Response Evaluation Criteria in Solid Tumors version 1.1 by independent central review. The data cutoff for this analysis was August 30, 2017. Forty-two patients were followed up for a median of 22.3 months (range, 2.63-30.82 months). The ORR was 24.3% (nine of 37 evaluable patients [95% confidence interval (CI), 11.8%-41.2%]). Two patients with partial response at the time of the initial analysis achieved complete response. The median overall survival (OS) was 25.1 months (95% CI, 13.1-not reached] and the 30-month OS rate was 46.3% (95% CI, 29.8%-61.3%). The median duration of response was not reached. Treatment-related adverse events (TRAEs) were reported in 78.6% of patients; the incidence of grade 3 to 5 TRAEs was 23.8%. No additional treatment-related deaths occurred since the initial analysis. Pembrolizumab provided durable antitumor activity and an acceptable safety profile in Japanese patients with advanced melanoma."
      }
    ],
    "reason": "R2 ORR9/37 and R3 response-evaluable37 represent the same efficacy cohort, distinct from42 treated."
  },
  {
    "id": "reviewed-35158786:1:4",
    "pmid": "35158786",
    "samples": [
      "52"
    ],
    "contexts": [
      {
        "stage": "R2",
        "source": "2ded89aa8bb7ab3f57fca263ddc7b1ea85747d6784517bd7d4a269f6f3b225ac",
        "binding": "9f5348a8878d8d698b661f516101caba735cb960407e01c6fd32e0c2e7bbd565",
        "population": "pop_overall",
        "comparator": null,
        "intervention": "arm_A"
      },
      {
        "stage": "R3",
        "source": "9fb62f34c6e0eb9c379dc81400f0bd452875ff991be44e9d968da34d519f6160",
        "binding": "2d552d9a84a2d6e38df729e9bdcbd253791f95a840a78479332c16f24455167f",
        "population": "p_A",
        "comparator": null,
        "intervention": "arm_A"
      }
    ],
    "preferred_context": 1,
    "evidence": [
      {
        "id": "CE-2d552d9a84a2d6e38df729e9-span-d8890270615675046dd83013",
        "source_id": "report-906504b0f8095cba350950ad:main:7203b5374c6ffea8",
        "block_id": "b00007",
        "supporting_quote": "We performed a retrospective multicenter explorative analysis. Patients with metastatic UM receiving any type of ICB (ipilimumab, nivolumab, pembrolizumab, ipilimumab plus anti-PD-1 antibodies (referred to as combined ICB)) were eligible. A total of 177 patients were included and stratified into two cohorts. Cohort A comprised patients who underwent re-induction with ICB ( n = 52, cohort A) while cohort B included those with only one treatment course of ICB ( n = 125, cohort B). A re-induction was recorded when ICB treatment was initiated a second time after the first treatment with ICB was discontinued due to primary or acquired resistance or toxicity. For cohort A, response rates were analyzed both for the re-induction with ICB (A2) and the first treatment course with ICB (A1) as an additional intra-cohort control. In contrast, one best response to ICB was available and recorded for cohort B (B)."
      }
    ],
    "reason": "The same re-induction cohortA52 and single-course cohortB125 are explicitly defined; keep cohorts and treatment episodes distinct."
  },
  {
    "id": "reviewed-35158786:2:5",
    "pmid": "35158786",
    "samples": [
      "125"
    ],
    "contexts": [
      {
        "stage": "R2",
        "source": "2ded89aa8bb7ab3f57fca263ddc7b1ea85747d6784517bd7d4a269f6f3b225ac",
        "binding": "9f5348a8878d8d698b661f516101caba735cb960407e01c6fd32e0c2e7bbd565",
        "population": "pop_overall",
        "comparator": null,
        "intervention": "arm_B"
      },
      {
        "stage": "R3",
        "source": "9fb62f34c6e0eb9c379dc81400f0bd452875ff991be44e9d968da34d519f6160",
        "binding": "2d552d9a84a2d6e38df729e9bdcbd253791f95a840a78479332c16f24455167f",
        "population": "p_B",
        "comparator": null,
        "intervention": "arm_B"
      }
    ],
    "preferred_context": 1,
    "evidence": [
      {
        "id": "CE-2d552d9a84a2d6e38df729e9-span-d8890270615675046dd83013",
        "source_id": "report-906504b0f8095cba350950ad:main:7203b5374c6ffea8",
        "block_id": "b00007",
        "supporting_quote": "We performed a retrospective multicenter explorative analysis. Patients with metastatic UM receiving any type of ICB (ipilimumab, nivolumab, pembrolizumab, ipilimumab plus anti-PD-1 antibodies (referred to as combined ICB)) were eligible. A total of 177 patients were included and stratified into two cohorts. Cohort A comprised patients who underwent re-induction with ICB ( n = 52, cohort A) while cohort B included those with only one treatment course of ICB ( n = 125, cohort B). A re-induction was recorded when ICB treatment was initiated a second time after the first treatment with ICB was discontinued due to primary or acquired resistance or toxicity. For cohort A, response rates were analyzed both for the re-induction with ICB (A2) and the first treatment course with ICB (A1) as an additional intra-cohort control. In contrast, one best response to ICB was available and recorded for cohort B (B)."
      }
    ],
    "reason": "The same re-induction cohortA52 and single-course cohortB125 are explicitly defined; keep cohorts and treatment episodes distinct."
  },
  {
    "id": "reviewed-33939387:1:2",
    "pmid": "33939387",
    "samples": [
      "29"
    ],
    "contexts": [
      {
        "stage": "R2",
        "source": "732be300e1d987cc701ab435ce58296f9c0464ac743f6f923ff61afcbd2900fc",
        "binding": "67b6397982a29c403aed3d41a27f1db9ea7b4b02866338672caf8862b01cc7a4",
        "population": "pop-overall",
        "comparator": null,
        "intervention": "arm-ici"
      },
      {
        "stage": "R3",
        "source": "3f6ccc2ecc79b48983fd58eef1e5c34e69e8e84de8f5de40bbbdaa01c61e6794",
        "binding": "66f3c987cf2b1a30fba8b5f526ae2f505c000cbca3ceb51a0e170a334e2f251b",
        "population": "r3-pop-ici",
        "comparator": null,
        "intervention": "r3-arm-ici"
      }
    ],
    "preferred_context": 1,
    "evidence": [
      {
        "id": "CE-66f3c987cf2b1a30fba8b5f5-span-5e9dec8af44e61a59631be30",
        "source_id": "report-1d7cbf37e5932a110b19d813:main:fecb140f44bc5351",
        "block_id": "b00014",
        "supporting_quote": "Of the 47 patients, 29 received ICI therapy and 18 did not. Of the 29 patients who received ICI, 5 received a CTLA-4 inhibitor, 8 received a PD-L1 inhibitor, and 16 received a combination of CTLA-4 and PD-L1 inhibitors. Twenty-two (76%) of the 29 patients received ICI therapy after development of metastasis or local disease progression, and seven patients (24%) received it in the adjuvant (nonmetastatic) setting. The median patient age in the ICI group was 58 years (min-max, 32–77), and 47% were women. Molecular testing for BRAF, NRAS and KIT was performed in 35 patients. However, in the non-immunotherapy (NI) group there was missing information for 10/18 patients, precluding a meaningful comparison between the groups. For the 35 patients with available information on all three genes, the molecular subtypes were, in decreasing frequency, triple negative (51.4%), KIT mutation (34.3%), NRAS mutation (14.3%) and BRAF mutation (2.9%). One patient had a mutation in both KIT and BRAF . Patient and tumor characteristics were comparable between the two groups of patients ( Table 1 )."
      }
    ],
    "reason": "Source explicitly describes29 ICI-treated anorectal melanoma patients and their three immunotherapy categories."
  },
  {
    "id": "reviewed-33288749:2:4",
    "pmid": "33288749",
    "samples": [
      "20"
    ],
    "contexts": [
      {
        "stage": "R2",
        "source": "d19026c855021a37e62e3039d9b20c7479d5afe4fd91a34a6753d7072d5da005",
        "binding": "19cfb61dc61f655cedd19bc7a08f60dfbb2aa8f51973b0d0cd5a1df5647797fb",
        "population": "pop_wild_type",
        "comparator": null,
        "intervention": "arm_B"
      },
      {
        "stage": "R3",
        "source": "188e9374f53343d0520c2d8cbef0e744863b14370a5f952d9bcacf2efdbf0f89",
        "binding": "18aaa8b16df320ae65265f2008b16d386c975000fa433fe4eb6b29e152e72003",
        "population": "r3_pop_B",
        "comparator": null,
        "intervention": "r3_arm_B"
      }
    ],
    "preferred_context": 1,
    "evidence": [
      {
        "id": "CE-18aaa8b16df320ae65265f20-span-3afcbcc25ed3d43ddca0fd8e",
        "source_id": "report-58221cc5e319af9d1a91c4be:main:14361880ed55a765",
        "block_id": "b00042",
        "supporting_quote": "Following a 28-day screening phase, patients were enrolled in one of three study cohorts (Supplementary Fig. 5 ). Cohort A included patients with BRAF V600E - or BRAF V600K -mutant disease who received dabrafenib 150 mg twice daily, trametinib 2 mg once daily, and durvalumab 3 mg/kg (first dose-escalation cohort) or 10 mg/kg administered intravenously Q2W (dose-expansion phase). Dabrafenib and trametinib were administered until confirmed progressive disease or intolerable toxicity, and durvalumab was administered for up to 12 months. Cohort B included patients with BRAF -wild type melanoma who received concurrent trametinib 2 mg once daily and durvalumab 10 mg/kg intravenously Q2W for up to 12 months until confirmed disease progression or intolerable toxicity. Cohort C included patients with BRAF -wild type melanoma who received sequential doses of trametinib 2 mg once daily for 42 days and durvalumab 10 mg/kg Q2W starting on day 29 for up to 12 months. In all 3 treatment cohorts, durvalumab would be stopped at 12 months in the absence of confirmed progression, initiation of alternative cancer therapy, unacceptable toxicity, withdrawal of consent, or other reason to discontinue treatment."
      }
    ],
    "reason": "The BRAF-wild-type concurrent trametinib/durvalumab cohortB is the same specific arm; retain BRAF-wild-type criterion.",
    "group_label": "BRAF wild-type; cohort B, concurrent treatment"
  },
  {
    "id": "reviewed-30804515:1:4",
    "pmid": "30804515",
    "samples": [
      "27"
    ],
    "contexts": [
      {
        "stage": "R2",
        "source": "1f622f19e9a43cce0fdcca4c82e4fed28d964f56c9830d695d69df2ab1017eaa",
        "binding": "0776dad59fc8ce9bba5df5bcae5bcc3d849387bb65608f3afdbf1acb8700c60b",
        "population": "p1",
        "comparator": null,
        "intervention": "a1"
      },
      {
        "stage": "R3",
        "source": "a8c23bbbe55112e7f02b1532daaac3d8c991735ea775b3ae89b7ea3b28c1fe6a",
        "binding": "e343b61fd374f10e5d80cf11f7bf688e5c285cb0e320a5d65e1b40abe49aa1e2",
        "population": "p2",
        "comparator": null,
        "intervention": "a1"
      }
    ],
    "preferred_context": 1,
    "evidence": [
      {
        "id": "CE-0776dad59fc8ce9bba5df5bc-span-bb514e16234ea2db47eb2aff",
        "source_id": "report-679222b6e139c9547b829443:citation",
        "block_id": "abstract",
        "supporting_quote": "Immunologic responses to anti-PD-1 therapy in melanoma patients occur rapidly with pharmacodynamic T cell responses detectable in blood by 3 weeks. It is unclear, however, whether these early blood-based observations translate to the tumor microenvironment. We conducted a study of neoadjuvant/adjuvant anti-PD-1 therapy in stage III/IV melanoma. We hypothesized that immune reinvigoration in the tumor would be detectable at 3 weeks and that this response would correlate with disease-free survival. We identified a rapid and potent anti-tumor response, with 8 of 27 patients experiencing a complete or major pathological response after a single dose of anti-PD-1, all of whom remain disease free. These rapid pathologic and clinical responses were associated with accumulation of exhausted CD8 T cells in the tumor at 3 weeks, with reinvigoration in the blood observed as early as 1 week. Transcriptional analysis demonstrated a pretreatment immune signature (neoadjuvant response signature) that was associated with clinical benefit. In contrast, patients with disease recurrence displayed mechanisms of resistance including immune suppression, mutational escape, and/or tumor evolution. Neoadjuvant anti-PD-1 treatment is effective in high-risk resectable stage III/IV melanoma. Pathological response and immunological analyses after a single neoadjuvant dose can be used to predict clinical outcome and to dissect underlying mechanisms in checkpoint blockade."
      },
      {
        "id": "CE-e343b61fd374f10e5d80cf11-span-2c8dd3287d4335fd3a8f9798",
        "source_id": "report-679222b6e139c9547b829443:main:0f238874421e667c",
        "block_id": "b00008",
        "supporting_quote": "We assessed the pathologic response after one dose of pembrolizumab in the resection specimens of 27 patients available at time of data cut-off. Resected tumor had features of completely viable, mixed viable and necrotic, or completely necrotic tumor upon gross examination ( Figure 1B ). On histologic assessment, 8 of 27 patients (29.6%, 95% CI 13.8–50.2%) had a complete (no residual tumor identified; n=5) or major (10% or less viable tumor cells; n=3) pathologic response 7 , 8 ( Figure 1C ). The median duration of follow-up for disease-free survival (DFS) was 25 months; median DFS has not been reached. The 1-year DFS rate ± SE was 63% ± 9% ( Figure 1D )."
      }
    ],
    "reason": "Abstract8/27 pathologic responders correspond to the27 resection specimens available at cutoff in the full text, not all29 enrolled."
  },
  {
    "id": "reviewed-30894212:1:4",
    "pmid": "30894212",
    "samples": [
      "39"
    ],
    "contexts": [
      {
        "stage": "R2",
        "source": "a71175d1b1d2d4e788348eab179a488f0cfb0c63abf829121942655a452bf1d0",
        "binding": "a2f9104b00fd3bcd761f6639db86ff540fae24f3b9cfc3ee0db5dc72ca77ba6e",
        "population": "p_naive",
        "comparator": null,
        "intervention": "a_all"
      },
      {
        "stage": "R3",
        "source": "88d9af878f90d3e9f7e8eeabe95ccba11c39b737c28c850e4e19f6efc70b6394",
        "binding": "a4f9d30596c0d90ba3266074b24e2db0f9362310398b937bc0c778bdb4be6ee6",
        "population": "p3_naive",
        "comparator": null,
        "intervention": "r3_all"
      }
    ],
    "preferred_context": 1,
    "evidence": [
      {
        "id": "CE-a4f9d30596c0d90ba3266074-span-0795894a600890c89db3c7f5",
        "source_id": "report-2ffcb83963aadfdaf3b04c8d:main:21d99e3b11cec7f0",
        "block_id": "b00035",
        "supporting_quote": "Efficacy was evaluable in all 50 patients enrolled, including 39 immunotherapy-naive patients and 11 patients with prior immunotherapy for advanced or metastatic disease. Of 39 immunotherapy-naive patients, objective responses were observed in 10 patients (26%) by irRC (CR, 8%; PR, 18%) and 9 patients (23%) by RECIST v1.1 (CR, 8%; PR, 15%; Table 4 and Fig. 1 ). Median (range) DOR was 392 (148–1149+) days by irRC and 657 (114–1177+) days by RECIST v1.1. Twenty-five immunotherapy-naive patients achieved disease control by irRC (64%; 15 SD) and 19 by RECIST v1.1 (49%; 10 SD). No objective response was seen in the 11 patients who received prior immunotherapy, although 4 patients (36%) and 3 patients (27%) had SD by irRC and RECIST v1.1, respectively (Table 4 ). Table 4 Best Objective Response by irRC and RECIST v1.1 n (%) irRC RECIST Immunotherapy-Naive ( n = 39) Prior Immunotherapy ( n = 11) Immunotherapy-Naive ( n = 39) Prior Immunotherapy ( n = 11) Objective response rate 10 (25.6) 0 9 (23.1) 0 Complete response 3 (7.7) 0 3 (7.7) 0 Partial response 7 (17.9) 0 6 (15.4) 0 Stable disease 15 (38.5) 4 (36.4) 10 (25.6) 3 (27.3) Disease control rate 25 (64.1) 4 (36.4) 19 (48.7) 3 (27.3) Progressive disease 7 (17.9) 5 (45.5) 15 (38.5) 6 (54.5) Missing 7 (17.9) 2 (18.2) 5 (12.8) 2 (18.2) irRC immune-related response criteria, RECIST Response Evaluation Criteria in Solid Tumors Fig. 1 Change From Baseline in Target Lesions in Immunotherapy-Naive Patients by irRC. a Best percentage change from baseline in target lesions and ( b ) percentage change in target lesions over time. BID, twice daily; irRC, immune-related response criteria. * 50 mg BID intermittent; best change from baseline was 0.98%. Of 39 efficacy-evaluable immunotherapy-naive patients, data are shown for the 31 patients with postbaseline scans that included assessment of target lesions. Y axis values were shown as a maximum of 100% for readability; actual values for the first 4 bars from the left in ( a ) were 687, 259, 181, and 117%"
      },
      {
        "id": "CE-a4f9d30596c0d90ba3266074-span-1766e822e6d859588b493ef9",
        "source_id": "report-2ffcb83963aadfdaf3b04c8d:main:21d99e3b11cec7f0",
        "block_id": "b00028",
        "supporting_quote": "All 50 patients received ≥1 dose of epacadostat, with a median (range) exposure of 84 (1–1352) days (Additional file 1 : Table S1). Because of the protocol amendment to evaluate lower doses of epacadostat (< 100 mg BID), durations of exposure in the 100-mg BID (1 day) and 300-mg BID (median, 41 days) cohorts were shorter than in other dose cohorts. Forty-nine patients received ≥1 dose of ipilimumab (median dose/cycle, 3 mg/kg); the 1 patient treated with epacadostat 100 mg BID starting dose received only 1 dose of epacadostat and did not receive ipilimumab (Additional file 1 : Table S1). The majority of patients ( n = 28; 56.0%) received all 4 planned doses of ipilimumab. Among the 42 patients treated with epacadostat ≤50 mg BID, the median exposure to epacadostat ranged from 79 to 239 days; 27 patients (64%) received all 4 doses of ipilimumab."
      },
      {
        "id": "CE-a4f9d30596c0d90ba3266074-span-462e8763a0debdfb317aaf8a",
        "source_id": "report-2ffcb83963aadfdaf3b04c8d:main:21d99e3b11cec7f0",
        "block_id": "b00010",
        "supporting_quote": "Based on the safety, pharmacokinetic, and pharmacodynamic findings of epacadostat monotherapy in the phase 1 first-in-human study [ 18 ], two initial dose schedules of epacadostat (300 mg and 600 mg twice daily [BID]) were planned for evaluation in combination with intravenous ipilimumab 3 mg/kg every 3 weeks (Q3W) in a 6 + 6 dose-escalation design. Epacadostat dosing was to have been escalated if fewer than 2 of the first 6 evaluable patients or (when an additional 6 evaluable patients were enrolled) fewer than 3 of 12 evaluable patients experienced a dose-limiting toxicity (DLT). Dose interruptions, reductions, and discontinuations for epacadostat and dose interruptions and discontinuations for ipilimumab were allowed if patients experienced protocol-defined toxicity. A few of the first patients who received an epacadostat starting dose of 300 mg BID began to experience clinically significant alanine aminotransferase (ALT) elevations, resulting in dose reductions to epacadostat 100 mg BID and a protocol amendment to lower the epacadostat starting dose to 100 mg BID, under which 1 patient was enrolled. When 5 of 7 patients who initially received epacadostat 300 mg BID in combination with ipilimumab developed clinically significant ALT elevations (including 2 patients who experienced dose-limiting ALT elevations after having their doses reduced to 100 mg BID; ALT elevations were reversible with corticosteroids upon treatment discontinuation), the investigators and sponsor stopped epacadostat treatment and further enrollment in the study, which was subsequently placed on clinical hold for 6 months by the FDA. The study then reopened after the protocol was amended to include additional pharmacovigilance monitoring and to evaluate epacadostat doses ≤50 mg BID (25 mg BID, 50 mg BID continuous, 50 mg BID intermittent [2 weeks on/1 week off], and 75 mg daily [50 mg am , 25 mg pm ]) plus ipilimumab 3 mg/kg Q3W. Epacadostat doses ≥100 mg BID were not explored further in this study. After completing 12 weeks (four 21-day cycles) of the combination treatment, patients who received benefit could continue treatment with epacadostat monotherapy at their assigned dose (or a lower dose if needed based on safety findings) for up to 2 years."
      }
    ],
    "reason": "Same immunotherapy-naive39, prior-immunotherapy11 and total50. Full text clarifies one patient never received ipilimumab and permitted epacadostat maintenance; preserve those regimen details rather than assuming all received identical exposure.",
    "treatment_preferences": {
      "intervention": {
        "context": 1,
        "reason": "The total and immunotherapy-naive cohorts include the one100mg patient who received epacadostat without ipilimumab. Full text explicitly documents the combination dose groups and this monotherapy exception.",
        "evidence": [
          {
            "id": "CE-a4f9d30596c0d90ba3266074-span-1766e822e6d859588b493ef9",
            "source_id": "report-2ffcb83963aadfdaf3b04c8d:main:21d99e3b11cec7f0",
            "block_id": "b00028",
            "supporting_quote": "All 50 patients received ≥1 dose of epacadostat, with a median (range) exposure of 84 (1–1352) days (Additional file 1 : Table S1). Because of the protocol amendment to evaluate lower doses of epacadostat (< 100 mg BID), durations of exposure in the 100-mg BID (1 day) and 300-mg BID (median, 41 days) cohorts were shorter than in other dose cohorts. Forty-nine patients received ≥1 dose of ipilimumab (median dose/cycle, 3 mg/kg); the 1 patient treated with epacadostat 100 mg BID starting dose received only 1 dose of epacadostat and did not receive ipilimumab (Additional file 1 : Table S1). The majority of patients ( n = 28; 56.0%) received all 4 planned doses of ipilimumab. Among the 42 patients treated with epacadostat ≤50 mg BID, the median exposure to epacadostat ranged from 79 to 239 days; 27 patients (64%) received all 4 doses of ipilimumab."
          },
          {
            "id": "CE-a4f9d30596c0d90ba3266074-span-4db3c29a3f48c51dd9e0cd34",
            "source_id": "report-2ffcb83963aadfdaf3b04c8d:main:21d99e3b11cec7f0",
            "block_id": "b00024",
            "supporting_quote": "A total of 50 patients were enrolled in the study. The first 8 enrolled patients were treated with epacadostat 300 mg BID [ n = 7] or 100 mg BID [ n = 1] in combination with ipilimumab 3 mg/kg Q3W. Five of 7 patients treated with epacadostat 300 mg BID experienced clinically significant grade 3/4 ALT elevations (all reversible with corticosteroids upon treatment discontinuation), which led to an amendment in the study protocol to evaluate lower epacadostat doses. After the amendment, the study was restarted and patients were treated with epacadostat 25 mg BID ( n = 8), 50 mg BID continuous ( n = 18), 50 mg BID intermittent (2 weeks on/1 week off; n = 9), or 75 mg daily (50 mg am , 25 mg pm ; n = 7) in combination with ipilimumab 3 mg/kg Q3W."
          },
          {
            "id": "CE-a4f9d30596c0d90ba3266074-span-8817717a6f0bacec71774c43",
            "source_id": "report-2ffcb83963aadfdaf3b04c8d:main:21d99e3b11cec7f0",
            "block_id": "b00026",
            "supporting_quote": "Baseline demographic and disease characteristics for the 50 patients are shown in Table 2 . Median (range) age was 63 (25–81) years, 64% of patients were men, and all were white. The majority of patients had stage IV melanoma (94%) and M1c disease (70%). The most common sites of metastases at baseline were the lymph nodes (56%), lung (52%), and liver (30%). Sixteen patients (32%) had BRAF mutations, and 12 (24%) had elevated lactate dehydrogenase levels. Before enrollment, 40% of patients had received radiation therapy for melanoma, and 46% had been treated with systemic therapy in the advanced or metastatic disease setting. Immune checkpoint inhibitors were the most common prior systemic treatments among these patients ( n = 6; 12%). Thirty-nine patients were immunotherapy-naive for advanced or metastatic disease, and 11 had received prior immunotherapy (immune checkpoint inhibitor, interferon, IL-2, or other) for advanced or metastatic disease. Table 2 Patient Demographics and Disease Characteristics at Baseline 25 mg BID ( n = 8) 50 mg BID Cont’ ( n = 18) 50 mg BID Int’ ( n = 9) 75 mg Total Daily ( n = 7) 100 mg BID a ( n = 1) 300 mg BID a ( n = 7) Total ( N = 50) Age Median (range), y 67 (34–81) 57 (25–78) 69 (49–77) 62 (35–81) 67 (67) 64 (47–81) 63 (25–81) ≤ 65 y, n (%) 3 (37.5) 14 (77.8) 2 (22.2) 4 (57.1) 0 5 (71.4) 28 (56.0) White, n (%) 8 (100.0) 18 (100.0) 9 (100.0) 7 (100.0) 1 (100.0) 7 (100.0) 50 (100.0) Men, n (%) 6 (75.0) 9 (50.0) 6 (66.7) 3 (42.9) 1 (100.0) 7 (100.0) 32 (64.0) ECOG PS, n (%) 0 5 (62.5) 16 (88.9) 6 (66.7) 6 (85.7) 1 (100.0) 4 (57.1) 38 (76.0) 1 3 (37.5) 2 (11.1) 3 (33.3) 1 (14.3) 0 3 (42.9) 12 (24.0) Current staging, n (%) IIIB 1 (12.5) b 0 0 0 0 0 1 (2.0) IIIC 0 0 2 (22.2) 0 0 0 2 (4.0) IV 7 (87.5) 18 (100.0) 7 (77.8) 7 (100.0) 1 (100.0) 7 (100.0) 47 (94.0) Current M classification, n (%) 0 0 0 2 (22.2) 0 0 0 2 (4.0) 1a 1 (12.5) 3 (16.7) 0 2 (28.6) 0 2 (28.6) 8 (16.0) 1b 2 (25.0) 1 (5.6) 1 (11.1) 1 (14.3) 0 0 5 (10.0) 1c 5 (62.5) 14 (77.8) 6 (66.7) 4 (57.1) 1 (100.0) 5 (71.4) 35 (70.0) Most common sites of metastases, n (%) Lymph nodes 3 (37.5) 12 (66.7) 4 (44.4) 3 (42.9) 0 6 (85.7) 28 (56.0) Lung 4 (50.0) 13 (72.2) 4 (44.4) 3 (42.9) 1 (100.0) 1 (14.3) 26 (52.0) Liver 2 (25.0) 6 (33.3) 3 (33.3) 3 (42.9) 0 1 (14.3) 15 (30.0) Abdomen 0 3 (16.7) 3 (33.3) 0 0 3 (42.9) 9 (18.0) Skin 1 (12.5) 4 (22.2) 1 (11.1) 1 (14.3) 0 2 (28.6) 9 (18.0) Adrenals 1 (12.5) 3 (16.7) 2 (22.2) 0 1 (100.0) 0 7 (14.0) CNS/brain 1 (12.5) 4 (22.2) 0 1 (14.3) 0 0 6 (12.0) Chest wall 0 2 (11.1) 0 1 (14.3) 0 2 (28.6) 5 (10.0) Breast 0 3 (16.7) 0 0 0 0 3 (6.0) Peritoneum 0 0 1 (11.1) 1 (14.3) 0 0 2 (4.0) Bone 0 0 0 0 0 1 (14.3) 1 (2.0) Pancreas 0 1 (5.6) 0 0 0 0 1 (2.0) Pleura 0 1 (5.6) 0 0 0 0 1 (2.0) Other 5 (62.5) 6 (33.3) 1 (11.1) 2 (28.6) 0 3 (42.9) 17 (34.0) BRAF -mutant positive, n (%) 2 (25.0) 8 (44.4) 2 (22.2) 1 (14.3) 1 (100.0) 2 (28.6) 16 (32.0) Elevated LDH level, n (%) 2 (25.0) 3 (16.7) 3 (33.3) 2 (28.6) 0 2 (28.6) 12 (24.0) Prior radiation therapy, n (%) 4 (50.0) 8 (44.4) 2 (22.2) 3 (42.9) 0 3 (42.9) 20 (40.0) Prior systemic regimens for advanced or metastatic disease, n (%) 1 (12.5) 12 (66.7) 3 (33.3) 2 (28.6) 1 (100.0) 4 (57.1) 23 (46.0) Prior systemic therapy for advanced or metastatic disease, n (%) Immunotherapy 0 6 (33.3) 3 (33.3) 1 (14.3) 0 1 (14.3) 11 (22.0) Immune checkpoint inhibitor 0 3 (16.7) 2 (22.2) 1 (14.3) 0 0 6 (12.0) Interferon 0 3 (16.7) 1 (11.1) 0 0 1 (14.3) 5 (10.0) IL-2 0 1 (5.6) 1 (11.1) 0 0 0 2 (4.0) Other 0 1 (5.6) 1 (11.1) 0 0 0 2 (4.0) BRAF inhibitor 0 3 (16.7) 0 0 0 1 (14.3) 4 (8.0) Chemotherapy 0 2 (11.1) 0 1 (14.3) 0 2 (28.6) 5 (10.0) Other 0 4 (22.2) 1 (11.1) 2 (28.6) 1 (100.0) 1 (14.3) 9 (18.0) BID twice daily, CNS central nervous system, cont ’ continuous, ECOG PS Eastern Cooperative Oncology Group performance status, IL-2 interleukin 2, int’ intermittent, LDH lactate dehydrogenase a Epacadostat 100-mg BID and 300-mg BID dose cohorts were not re-explored in this study after protocol amendment to evaluate lower doses of epacadostat b Patient was incorrectly staged as IIIB by study site; this patient had metastases in the liver and therefore should have been reported as stage IV"
          }
        ]
      }
    }
  },
  {
    "id": "reviewed-30894212:2:5",
    "pmid": "30894212",
    "samples": [
      "11"
    ],
    "contexts": [
      {
        "stage": "R2",
        "source": "a71175d1b1d2d4e788348eab179a488f0cfb0c63abf829121942655a452bf1d0",
        "binding": "a2f9104b00fd3bcd761f6639db86ff540fae24f3b9cfc3ee0db5dc72ca77ba6e",
        "population": "p_prior",
        "comparator": null,
        "intervention": "a_all"
      },
      {
        "stage": "R3",
        "source": "88d9af878f90d3e9f7e8eeabe95ccba11c39b737c28c850e4e19f6efc70b6394",
        "binding": "a4f9d30596c0d90ba3266074b24e2db0f9362310398b937bc0c778bdb4be6ee6",
        "population": "p3_prior",
        "comparator": null,
        "intervention": "r3_all"
      }
    ],
    "preferred_context": 1,
    "evidence": [
      {
        "id": "CE-a4f9d30596c0d90ba3266074-span-0795894a600890c89db3c7f5",
        "source_id": "report-2ffcb83963aadfdaf3b04c8d:main:21d99e3b11cec7f0",
        "block_id": "b00035",
        "supporting_quote": "Efficacy was evaluable in all 50 patients enrolled, including 39 immunotherapy-naive patients and 11 patients with prior immunotherapy for advanced or metastatic disease. Of 39 immunotherapy-naive patients, objective responses were observed in 10 patients (26%) by irRC (CR, 8%; PR, 18%) and 9 patients (23%) by RECIST v1.1 (CR, 8%; PR, 15%; Table 4 and Fig. 1 ). Median (range) DOR was 392 (148–1149+) days by irRC and 657 (114–1177+) days by RECIST v1.1. Twenty-five immunotherapy-naive patients achieved disease control by irRC (64%; 15 SD) and 19 by RECIST v1.1 (49%; 10 SD). No objective response was seen in the 11 patients who received prior immunotherapy, although 4 patients (36%) and 3 patients (27%) had SD by irRC and RECIST v1.1, respectively (Table 4 ). Table 4 Best Objective Response by irRC and RECIST v1.1 n (%) irRC RECIST Immunotherapy-Naive ( n = 39) Prior Immunotherapy ( n = 11) Immunotherapy-Naive ( n = 39) Prior Immunotherapy ( n = 11) Objective response rate 10 (25.6) 0 9 (23.1) 0 Complete response 3 (7.7) 0 3 (7.7) 0 Partial response 7 (17.9) 0 6 (15.4) 0 Stable disease 15 (38.5) 4 (36.4) 10 (25.6) 3 (27.3) Disease control rate 25 (64.1) 4 (36.4) 19 (48.7) 3 (27.3) Progressive disease 7 (17.9) 5 (45.5) 15 (38.5) 6 (54.5) Missing 7 (17.9) 2 (18.2) 5 (12.8) 2 (18.2) irRC immune-related response criteria, RECIST Response Evaluation Criteria in Solid Tumors Fig. 1 Change From Baseline in Target Lesions in Immunotherapy-Naive Patients by irRC. a Best percentage change from baseline in target lesions and ( b ) percentage change in target lesions over time. BID, twice daily; irRC, immune-related response criteria. * 50 mg BID intermittent; best change from baseline was 0.98%. Of 39 efficacy-evaluable immunotherapy-naive patients, data are shown for the 31 patients with postbaseline scans that included assessment of target lesions. Y axis values were shown as a maximum of 100% for readability; actual values for the first 4 bars from the left in ( a ) were 687, 259, 181, and 117%"
      },
      {
        "id": "CE-a4f9d30596c0d90ba3266074-span-1766e822e6d859588b493ef9",
        "source_id": "report-2ffcb83963aadfdaf3b04c8d:main:21d99e3b11cec7f0",
        "block_id": "b00028",
        "supporting_quote": "All 50 patients received ≥1 dose of epacadostat, with a median (range) exposure of 84 (1–1352) days (Additional file 1 : Table S1). Because of the protocol amendment to evaluate lower doses of epacadostat (< 100 mg BID), durations of exposure in the 100-mg BID (1 day) and 300-mg BID (median, 41 days) cohorts were shorter than in other dose cohorts. Forty-nine patients received ≥1 dose of ipilimumab (median dose/cycle, 3 mg/kg); the 1 patient treated with epacadostat 100 mg BID starting dose received only 1 dose of epacadostat and did not receive ipilimumab (Additional file 1 : Table S1). The majority of patients ( n = 28; 56.0%) received all 4 planned doses of ipilimumab. Among the 42 patients treated with epacadostat ≤50 mg BID, the median exposure to epacadostat ranged from 79 to 239 days; 27 patients (64%) received all 4 doses of ipilimumab."
      },
      {
        "id": "CE-a4f9d30596c0d90ba3266074-span-462e8763a0debdfb317aaf8a",
        "source_id": "report-2ffcb83963aadfdaf3b04c8d:main:21d99e3b11cec7f0",
        "block_id": "b00010",
        "supporting_quote": "Based on the safety, pharmacokinetic, and pharmacodynamic findings of epacadostat monotherapy in the phase 1 first-in-human study [ 18 ], two initial dose schedules of epacadostat (300 mg and 600 mg twice daily [BID]) were planned for evaluation in combination with intravenous ipilimumab 3 mg/kg every 3 weeks (Q3W) in a 6 + 6 dose-escalation design. Epacadostat dosing was to have been escalated if fewer than 2 of the first 6 evaluable patients or (when an additional 6 evaluable patients were enrolled) fewer than 3 of 12 evaluable patients experienced a dose-limiting toxicity (DLT). Dose interruptions, reductions, and discontinuations for epacadostat and dose interruptions and discontinuations for ipilimumab were allowed if patients experienced protocol-defined toxicity. A few of the first patients who received an epacadostat starting dose of 300 mg BID began to experience clinically significant alanine aminotransferase (ALT) elevations, resulting in dose reductions to epacadostat 100 mg BID and a protocol amendment to lower the epacadostat starting dose to 100 mg BID, under which 1 patient was enrolled. When 5 of 7 patients who initially received epacadostat 300 mg BID in combination with ipilimumab developed clinically significant ALT elevations (including 2 patients who experienced dose-limiting ALT elevations after having their doses reduced to 100 mg BID; ALT elevations were reversible with corticosteroids upon treatment discontinuation), the investigators and sponsor stopped epacadostat treatment and further enrollment in the study, which was subsequently placed on clinical hold for 6 months by the FDA. The study then reopened after the protocol was amended to include additional pharmacovigilance monitoring and to evaluate epacadostat doses ≤50 mg BID (25 mg BID, 50 mg BID continuous, 50 mg BID intermittent [2 weeks on/1 week off], and 75 mg daily [50 mg am , 25 mg pm ]) plus ipilimumab 3 mg/kg Q3W. Epacadostat doses ≥100 mg BID were not explored further in this study. After completing 12 weeks (four 21-day cycles) of the combination treatment, patients who received benefit could continue treatment with epacadostat monotherapy at their assigned dose (or a lower dose if needed based on safety findings) for up to 2 years."
      }
    ],
    "reason": "Same immunotherapy-naive39, prior-immunotherapy11 and total50. Full text clarifies one patient never received ipilimumab and permitted epacadostat maintenance; preserve those regimen details rather than assuming all received identical exposure.",
    "treatment_preferences": {
      "intervention": {
        "context": 0,
        "reason": "The sole100mg patient who never received ipilimumab had no prior immunotherapy in Table2. The prior-immunotherapy11 subgroup therefore received combination treatment; do not import the overall cohort monotherapy alternative into this subgroup.",
        "evidence": [
          {
            "id": "CE-a4f9d30596c0d90ba3266074-span-1766e822e6d859588b493ef9",
            "source_id": "report-2ffcb83963aadfdaf3b04c8d:main:21d99e3b11cec7f0",
            "block_id": "b00028",
            "supporting_quote": "All 50 patients received ≥1 dose of epacadostat, with a median (range) exposure of 84 (1–1352) days (Additional file 1 : Table S1). Because of the protocol amendment to evaluate lower doses of epacadostat (< 100 mg BID), durations of exposure in the 100-mg BID (1 day) and 300-mg BID (median, 41 days) cohorts were shorter than in other dose cohorts. Forty-nine patients received ≥1 dose of ipilimumab (median dose/cycle, 3 mg/kg); the 1 patient treated with epacadostat 100 mg BID starting dose received only 1 dose of epacadostat and did not receive ipilimumab (Additional file 1 : Table S1). The majority of patients ( n = 28; 56.0%) received all 4 planned doses of ipilimumab. Among the 42 patients treated with epacadostat ≤50 mg BID, the median exposure to epacadostat ranged from 79 to 239 days; 27 patients (64%) received all 4 doses of ipilimumab."
          },
          {
            "id": "CE-a4f9d30596c0d90ba3266074-span-4db3c29a3f48c51dd9e0cd34",
            "source_id": "report-2ffcb83963aadfdaf3b04c8d:main:21d99e3b11cec7f0",
            "block_id": "b00024",
            "supporting_quote": "A total of 50 patients were enrolled in the study. The first 8 enrolled patients were treated with epacadostat 300 mg BID [ n = 7] or 100 mg BID [ n = 1] in combination with ipilimumab 3 mg/kg Q3W. Five of 7 patients treated with epacadostat 300 mg BID experienced clinically significant grade 3/4 ALT elevations (all reversible with corticosteroids upon treatment discontinuation), which led to an amendment in the study protocol to evaluate lower epacadostat doses. After the amendment, the study was restarted and patients were treated with epacadostat 25 mg BID ( n = 8), 50 mg BID continuous ( n = 18), 50 mg BID intermittent (2 weeks on/1 week off; n = 9), or 75 mg daily (50 mg am , 25 mg pm ; n = 7) in combination with ipilimumab 3 mg/kg Q3W."
          },
          {
            "id": "CE-a4f9d30596c0d90ba3266074-span-8817717a6f0bacec71774c43",
            "source_id": "report-2ffcb83963aadfdaf3b04c8d:main:21d99e3b11cec7f0",
            "block_id": "b00026",
            "supporting_quote": "Baseline demographic and disease characteristics for the 50 patients are shown in Table 2 . Median (range) age was 63 (25–81) years, 64% of patients were men, and all were white. The majority of patients had stage IV melanoma (94%) and M1c disease (70%). The most common sites of metastases at baseline were the lymph nodes (56%), lung (52%), and liver (30%). Sixteen patients (32%) had BRAF mutations, and 12 (24%) had elevated lactate dehydrogenase levels. Before enrollment, 40% of patients had received radiation therapy for melanoma, and 46% had been treated with systemic therapy in the advanced or metastatic disease setting. Immune checkpoint inhibitors were the most common prior systemic treatments among these patients ( n = 6; 12%). Thirty-nine patients were immunotherapy-naive for advanced or metastatic disease, and 11 had received prior immunotherapy (immune checkpoint inhibitor, interferon, IL-2, or other) for advanced or metastatic disease. Table 2 Patient Demographics and Disease Characteristics at Baseline 25 mg BID ( n = 8) 50 mg BID Cont’ ( n = 18) 50 mg BID Int’ ( n = 9) 75 mg Total Daily ( n = 7) 100 mg BID a ( n = 1) 300 mg BID a ( n = 7) Total ( N = 50) Age Median (range), y 67 (34–81) 57 (25–78) 69 (49–77) 62 (35–81) 67 (67) 64 (47–81) 63 (25–81) ≤ 65 y, n (%) 3 (37.5) 14 (77.8) 2 (22.2) 4 (57.1) 0 5 (71.4) 28 (56.0) White, n (%) 8 (100.0) 18 (100.0) 9 (100.0) 7 (100.0) 1 (100.0) 7 (100.0) 50 (100.0) Men, n (%) 6 (75.0) 9 (50.0) 6 (66.7) 3 (42.9) 1 (100.0) 7 (100.0) 32 (64.0) ECOG PS, n (%) 0 5 (62.5) 16 (88.9) 6 (66.7) 6 (85.7) 1 (100.0) 4 (57.1) 38 (76.0) 1 3 (37.5) 2 (11.1) 3 (33.3) 1 (14.3) 0 3 (42.9) 12 (24.0) Current staging, n (%) IIIB 1 (12.5) b 0 0 0 0 0 1 (2.0) IIIC 0 0 2 (22.2) 0 0 0 2 (4.0) IV 7 (87.5) 18 (100.0) 7 (77.8) 7 (100.0) 1 (100.0) 7 (100.0) 47 (94.0) Current M classification, n (%) 0 0 0 2 (22.2) 0 0 0 2 (4.0) 1a 1 (12.5) 3 (16.7) 0 2 (28.6) 0 2 (28.6) 8 (16.0) 1b 2 (25.0) 1 (5.6) 1 (11.1) 1 (14.3) 0 0 5 (10.0) 1c 5 (62.5) 14 (77.8) 6 (66.7) 4 (57.1) 1 (100.0) 5 (71.4) 35 (70.0) Most common sites of metastases, n (%) Lymph nodes 3 (37.5) 12 (66.7) 4 (44.4) 3 (42.9) 0 6 (85.7) 28 (56.0) Lung 4 (50.0) 13 (72.2) 4 (44.4) 3 (42.9) 1 (100.0) 1 (14.3) 26 (52.0) Liver 2 (25.0) 6 (33.3) 3 (33.3) 3 (42.9) 0 1 (14.3) 15 (30.0) Abdomen 0 3 (16.7) 3 (33.3) 0 0 3 (42.9) 9 (18.0) Skin 1 (12.5) 4 (22.2) 1 (11.1) 1 (14.3) 0 2 (28.6) 9 (18.0) Adrenals 1 (12.5) 3 (16.7) 2 (22.2) 0 1 (100.0) 0 7 (14.0) CNS/brain 1 (12.5) 4 (22.2) 0 1 (14.3) 0 0 6 (12.0) Chest wall 0 2 (11.1) 0 1 (14.3) 0 2 (28.6) 5 (10.0) Breast 0 3 (16.7) 0 0 0 0 3 (6.0) Peritoneum 0 0 1 (11.1) 1 (14.3) 0 0 2 (4.0) Bone 0 0 0 0 0 1 (14.3) 1 (2.0) Pancreas 0 1 (5.6) 0 0 0 0 1 (2.0) Pleura 0 1 (5.6) 0 0 0 0 1 (2.0) Other 5 (62.5) 6 (33.3) 1 (11.1) 2 (28.6) 0 3 (42.9) 17 (34.0) BRAF -mutant positive, n (%) 2 (25.0) 8 (44.4) 2 (22.2) 1 (14.3) 1 (100.0) 2 (28.6) 16 (32.0) Elevated LDH level, n (%) 2 (25.0) 3 (16.7) 3 (33.3) 2 (28.6) 0 2 (28.6) 12 (24.0) Prior radiation therapy, n (%) 4 (50.0) 8 (44.4) 2 (22.2) 3 (42.9) 0 3 (42.9) 20 (40.0) Prior systemic regimens for advanced or metastatic disease, n (%) 1 (12.5) 12 (66.7) 3 (33.3) 2 (28.6) 1 (100.0) 4 (57.1) 23 (46.0) Prior systemic therapy for advanced or metastatic disease, n (%) Immunotherapy 0 6 (33.3) 3 (33.3) 1 (14.3) 0 1 (14.3) 11 (22.0) Immune checkpoint inhibitor 0 3 (16.7) 2 (22.2) 1 (14.3) 0 0 6 (12.0) Interferon 0 3 (16.7) 1 (11.1) 0 0 1 (14.3) 5 (10.0) IL-2 0 1 (5.6) 1 (11.1) 0 0 0 2 (4.0) Other 0 1 (5.6) 1 (11.1) 0 0 0 2 (4.0) BRAF inhibitor 0 3 (16.7) 0 0 0 1 (14.3) 4 (8.0) Chemotherapy 0 2 (11.1) 0 1 (14.3) 0 2 (28.6) 5 (10.0) Other 0 4 (22.2) 1 (11.1) 2 (28.6) 1 (100.0) 1 (14.3) 9 (18.0) BID twice daily, CNS central nervous system, cont ’ continuous, ECOG PS Eastern Cooperative Oncology Group performance status, IL-2 interleukin 2, int’ intermittent, LDH lactate dehydrogenase a Epacadostat 100-mg BID and 300-mg BID dose cohorts were not re-explored in this study after protocol amendment to evaluate lower doses of epacadostat b Patient was incorrectly staged as IIIB by study site; this patient had metastases in the liver and therefore should have been reported as stage IV"
          }
        ]
      }
    }
  },
  {
    "id": "reviewed-30894212:3:6",
    "pmid": "30894212",
    "samples": [
      "50"
    ],
    "contexts": [
      {
        "stage": "R2",
        "source": "a71175d1b1d2d4e788348eab179a488f0cfb0c63abf829121942655a452bf1d0",
        "binding": "a2f9104b00fd3bcd761f6639db86ff540fae24f3b9cfc3ee0db5dc72ca77ba6e",
        "population": "p_all",
        "comparator": null,
        "intervention": "a_all"
      },
      {
        "stage": "R3",
        "source": "88d9af878f90d3e9f7e8eeabe95ccba11c39b737c28c850e4e19f6efc70b6394",
        "binding": "a4f9d30596c0d90ba3266074b24e2db0f9362310398b937bc0c778bdb4be6ee6",
        "population": "p3_all",
        "comparator": null,
        "intervention": "r3_all"
      }
    ],
    "preferred_context": 1,
    "evidence": [
      {
        "id": "CE-a4f9d30596c0d90ba3266074-span-0795894a600890c89db3c7f5",
        "source_id": "report-2ffcb83963aadfdaf3b04c8d:main:21d99e3b11cec7f0",
        "block_id": "b00035",
        "supporting_quote": "Efficacy was evaluable in all 50 patients enrolled, including 39 immunotherapy-naive patients and 11 patients with prior immunotherapy for advanced or metastatic disease. Of 39 immunotherapy-naive patients, objective responses were observed in 10 patients (26%) by irRC (CR, 8%; PR, 18%) and 9 patients (23%) by RECIST v1.1 (CR, 8%; PR, 15%; Table 4 and Fig. 1 ). Median (range) DOR was 392 (148–1149+) days by irRC and 657 (114–1177+) days by RECIST v1.1. Twenty-five immunotherapy-naive patients achieved disease control by irRC (64%; 15 SD) and 19 by RECIST v1.1 (49%; 10 SD). No objective response was seen in the 11 patients who received prior immunotherapy, although 4 patients (36%) and 3 patients (27%) had SD by irRC and RECIST v1.1, respectively (Table 4 ). Table 4 Best Objective Response by irRC and RECIST v1.1 n (%) irRC RECIST Immunotherapy-Naive ( n = 39) Prior Immunotherapy ( n = 11) Immunotherapy-Naive ( n = 39) Prior Immunotherapy ( n = 11) Objective response rate 10 (25.6) 0 9 (23.1) 0 Complete response 3 (7.7) 0 3 (7.7) 0 Partial response 7 (17.9) 0 6 (15.4) 0 Stable disease 15 (38.5) 4 (36.4) 10 (25.6) 3 (27.3) Disease control rate 25 (64.1) 4 (36.4) 19 (48.7) 3 (27.3) Progressive disease 7 (17.9) 5 (45.5) 15 (38.5) 6 (54.5) Missing 7 (17.9) 2 (18.2) 5 (12.8) 2 (18.2) irRC immune-related response criteria, RECIST Response Evaluation Criteria in Solid Tumors Fig. 1 Change From Baseline in Target Lesions in Immunotherapy-Naive Patients by irRC. a Best percentage change from baseline in target lesions and ( b ) percentage change in target lesions over time. BID, twice daily; irRC, immune-related response criteria. * 50 mg BID intermittent; best change from baseline was 0.98%. Of 39 efficacy-evaluable immunotherapy-naive patients, data are shown for the 31 patients with postbaseline scans that included assessment of target lesions. Y axis values were shown as a maximum of 100% for readability; actual values for the first 4 bars from the left in ( a ) were 687, 259, 181, and 117%"
      },
      {
        "id": "CE-a4f9d30596c0d90ba3266074-span-1766e822e6d859588b493ef9",
        "source_id": "report-2ffcb83963aadfdaf3b04c8d:main:21d99e3b11cec7f0",
        "block_id": "b00028",
        "supporting_quote": "All 50 patients received ≥1 dose of epacadostat, with a median (range) exposure of 84 (1–1352) days (Additional file 1 : Table S1). Because of the protocol amendment to evaluate lower doses of epacadostat (< 100 mg BID), durations of exposure in the 100-mg BID (1 day) and 300-mg BID (median, 41 days) cohorts were shorter than in other dose cohorts. Forty-nine patients received ≥1 dose of ipilimumab (median dose/cycle, 3 mg/kg); the 1 patient treated with epacadostat 100 mg BID starting dose received only 1 dose of epacadostat and did not receive ipilimumab (Additional file 1 : Table S1). The majority of patients ( n = 28; 56.0%) received all 4 planned doses of ipilimumab. Among the 42 patients treated with epacadostat ≤50 mg BID, the median exposure to epacadostat ranged from 79 to 239 days; 27 patients (64%) received all 4 doses of ipilimumab."
      },
      {
        "id": "CE-a4f9d30596c0d90ba3266074-span-462e8763a0debdfb317aaf8a",
        "source_id": "report-2ffcb83963aadfdaf3b04c8d:main:21d99e3b11cec7f0",
        "block_id": "b00010",
        "supporting_quote": "Based on the safety, pharmacokinetic, and pharmacodynamic findings of epacadostat monotherapy in the phase 1 first-in-human study [ 18 ], two initial dose schedules of epacadostat (300 mg and 600 mg twice daily [BID]) were planned for evaluation in combination with intravenous ipilimumab 3 mg/kg every 3 weeks (Q3W) in a 6 + 6 dose-escalation design. Epacadostat dosing was to have been escalated if fewer than 2 of the first 6 evaluable patients or (when an additional 6 evaluable patients were enrolled) fewer than 3 of 12 evaluable patients experienced a dose-limiting toxicity (DLT). Dose interruptions, reductions, and discontinuations for epacadostat and dose interruptions and discontinuations for ipilimumab were allowed if patients experienced protocol-defined toxicity. A few of the first patients who received an epacadostat starting dose of 300 mg BID began to experience clinically significant alanine aminotransferase (ALT) elevations, resulting in dose reductions to epacadostat 100 mg BID and a protocol amendment to lower the epacadostat starting dose to 100 mg BID, under which 1 patient was enrolled. When 5 of 7 patients who initially received epacadostat 300 mg BID in combination with ipilimumab developed clinically significant ALT elevations (including 2 patients who experienced dose-limiting ALT elevations after having their doses reduced to 100 mg BID; ALT elevations were reversible with corticosteroids upon treatment discontinuation), the investigators and sponsor stopped epacadostat treatment and further enrollment in the study, which was subsequently placed on clinical hold for 6 months by the FDA. The study then reopened after the protocol was amended to include additional pharmacovigilance monitoring and to evaluate epacadostat doses ≤50 mg BID (25 mg BID, 50 mg BID continuous, 50 mg BID intermittent [2 weeks on/1 week off], and 75 mg daily [50 mg am , 25 mg pm ]) plus ipilimumab 3 mg/kg Q3W. Epacadostat doses ≥100 mg BID were not explored further in this study. After completing 12 weeks (four 21-day cycles) of the combination treatment, patients who received benefit could continue treatment with epacadostat monotherapy at their assigned dose (or a lower dose if needed based on safety findings) for up to 2 years."
      }
    ],
    "reason": "Same immunotherapy-naive39, prior-immunotherapy11 and total50. Full text clarifies one patient never received ipilimumab and permitted epacadostat maintenance; preserve those regimen details rather than assuming all received identical exposure.",
    "treatment_preferences": {
      "intervention": {
        "context": 1,
        "reason": "The total and immunotherapy-naive cohorts include the one100mg patient who received epacadostat without ipilimumab. Full text explicitly documents the combination dose groups and this monotherapy exception.",
        "evidence": [
          {
            "id": "CE-a4f9d30596c0d90ba3266074-span-1766e822e6d859588b493ef9",
            "source_id": "report-2ffcb83963aadfdaf3b04c8d:main:21d99e3b11cec7f0",
            "block_id": "b00028",
            "supporting_quote": "All 50 patients received ≥1 dose of epacadostat, with a median (range) exposure of 84 (1–1352) days (Additional file 1 : Table S1). Because of the protocol amendment to evaluate lower doses of epacadostat (< 100 mg BID), durations of exposure in the 100-mg BID (1 day) and 300-mg BID (median, 41 days) cohorts were shorter than in other dose cohorts. Forty-nine patients received ≥1 dose of ipilimumab (median dose/cycle, 3 mg/kg); the 1 patient treated with epacadostat 100 mg BID starting dose received only 1 dose of epacadostat and did not receive ipilimumab (Additional file 1 : Table S1). The majority of patients ( n = 28; 56.0%) received all 4 planned doses of ipilimumab. Among the 42 patients treated with epacadostat ≤50 mg BID, the median exposure to epacadostat ranged from 79 to 239 days; 27 patients (64%) received all 4 doses of ipilimumab."
          },
          {
            "id": "CE-a4f9d30596c0d90ba3266074-span-4db3c29a3f48c51dd9e0cd34",
            "source_id": "report-2ffcb83963aadfdaf3b04c8d:main:21d99e3b11cec7f0",
            "block_id": "b00024",
            "supporting_quote": "A total of 50 patients were enrolled in the study. The first 8 enrolled patients were treated with epacadostat 300 mg BID [ n = 7] or 100 mg BID [ n = 1] in combination with ipilimumab 3 mg/kg Q3W. Five of 7 patients treated with epacadostat 300 mg BID experienced clinically significant grade 3/4 ALT elevations (all reversible with corticosteroids upon treatment discontinuation), which led to an amendment in the study protocol to evaluate lower epacadostat doses. After the amendment, the study was restarted and patients were treated with epacadostat 25 mg BID ( n = 8), 50 mg BID continuous ( n = 18), 50 mg BID intermittent (2 weeks on/1 week off; n = 9), or 75 mg daily (50 mg am , 25 mg pm ; n = 7) in combination with ipilimumab 3 mg/kg Q3W."
          },
          {
            "id": "CE-a4f9d30596c0d90ba3266074-span-8817717a6f0bacec71774c43",
            "source_id": "report-2ffcb83963aadfdaf3b04c8d:main:21d99e3b11cec7f0",
            "block_id": "b00026",
            "supporting_quote": "Baseline demographic and disease characteristics for the 50 patients are shown in Table 2 . Median (range) age was 63 (25–81) years, 64% of patients were men, and all were white. The majority of patients had stage IV melanoma (94%) and M1c disease (70%). The most common sites of metastases at baseline were the lymph nodes (56%), lung (52%), and liver (30%). Sixteen patients (32%) had BRAF mutations, and 12 (24%) had elevated lactate dehydrogenase levels. Before enrollment, 40% of patients had received radiation therapy for melanoma, and 46% had been treated with systemic therapy in the advanced or metastatic disease setting. Immune checkpoint inhibitors were the most common prior systemic treatments among these patients ( n = 6; 12%). Thirty-nine patients were immunotherapy-naive for advanced or metastatic disease, and 11 had received prior immunotherapy (immune checkpoint inhibitor, interferon, IL-2, or other) for advanced or metastatic disease. Table 2 Patient Demographics and Disease Characteristics at Baseline 25 mg BID ( n = 8) 50 mg BID Cont’ ( n = 18) 50 mg BID Int’ ( n = 9) 75 mg Total Daily ( n = 7) 100 mg BID a ( n = 1) 300 mg BID a ( n = 7) Total ( N = 50) Age Median (range), y 67 (34–81) 57 (25–78) 69 (49–77) 62 (35–81) 67 (67) 64 (47–81) 63 (25–81) ≤ 65 y, n (%) 3 (37.5) 14 (77.8) 2 (22.2) 4 (57.1) 0 5 (71.4) 28 (56.0) White, n (%) 8 (100.0) 18 (100.0) 9 (100.0) 7 (100.0) 1 (100.0) 7 (100.0) 50 (100.0) Men, n (%) 6 (75.0) 9 (50.0) 6 (66.7) 3 (42.9) 1 (100.0) 7 (100.0) 32 (64.0) ECOG PS, n (%) 0 5 (62.5) 16 (88.9) 6 (66.7) 6 (85.7) 1 (100.0) 4 (57.1) 38 (76.0) 1 3 (37.5) 2 (11.1) 3 (33.3) 1 (14.3) 0 3 (42.9) 12 (24.0) Current staging, n (%) IIIB 1 (12.5) b 0 0 0 0 0 1 (2.0) IIIC 0 0 2 (22.2) 0 0 0 2 (4.0) IV 7 (87.5) 18 (100.0) 7 (77.8) 7 (100.0) 1 (100.0) 7 (100.0) 47 (94.0) Current M classification, n (%) 0 0 0 2 (22.2) 0 0 0 2 (4.0) 1a 1 (12.5) 3 (16.7) 0 2 (28.6) 0 2 (28.6) 8 (16.0) 1b 2 (25.0) 1 (5.6) 1 (11.1) 1 (14.3) 0 0 5 (10.0) 1c 5 (62.5) 14 (77.8) 6 (66.7) 4 (57.1) 1 (100.0) 5 (71.4) 35 (70.0) Most common sites of metastases, n (%) Lymph nodes 3 (37.5) 12 (66.7) 4 (44.4) 3 (42.9) 0 6 (85.7) 28 (56.0) Lung 4 (50.0) 13 (72.2) 4 (44.4) 3 (42.9) 1 (100.0) 1 (14.3) 26 (52.0) Liver 2 (25.0) 6 (33.3) 3 (33.3) 3 (42.9) 0 1 (14.3) 15 (30.0) Abdomen 0 3 (16.7) 3 (33.3) 0 0 3 (42.9) 9 (18.0) Skin 1 (12.5) 4 (22.2) 1 (11.1) 1 (14.3) 0 2 (28.6) 9 (18.0) Adrenals 1 (12.5) 3 (16.7) 2 (22.2) 0 1 (100.0) 0 7 (14.0) CNS/brain 1 (12.5) 4 (22.2) 0 1 (14.3) 0 0 6 (12.0) Chest wall 0 2 (11.1) 0 1 (14.3) 0 2 (28.6) 5 (10.0) Breast 0 3 (16.7) 0 0 0 0 3 (6.0) Peritoneum 0 0 1 (11.1) 1 (14.3) 0 0 2 (4.0) Bone 0 0 0 0 0 1 (14.3) 1 (2.0) Pancreas 0 1 (5.6) 0 0 0 0 1 (2.0) Pleura 0 1 (5.6) 0 0 0 0 1 (2.0) Other 5 (62.5) 6 (33.3) 1 (11.1) 2 (28.6) 0 3 (42.9) 17 (34.0) BRAF -mutant positive, n (%) 2 (25.0) 8 (44.4) 2 (22.2) 1 (14.3) 1 (100.0) 2 (28.6) 16 (32.0) Elevated LDH level, n (%) 2 (25.0) 3 (16.7) 3 (33.3) 2 (28.6) 0 2 (28.6) 12 (24.0) Prior radiation therapy, n (%) 4 (50.0) 8 (44.4) 2 (22.2) 3 (42.9) 0 3 (42.9) 20 (40.0) Prior systemic regimens for advanced or metastatic disease, n (%) 1 (12.5) 12 (66.7) 3 (33.3) 2 (28.6) 1 (100.0) 4 (57.1) 23 (46.0) Prior systemic therapy for advanced or metastatic disease, n (%) Immunotherapy 0 6 (33.3) 3 (33.3) 1 (14.3) 0 1 (14.3) 11 (22.0) Immune checkpoint inhibitor 0 3 (16.7) 2 (22.2) 1 (14.3) 0 0 6 (12.0) Interferon 0 3 (16.7) 1 (11.1) 0 0 1 (14.3) 5 (10.0) IL-2 0 1 (5.6) 1 (11.1) 0 0 0 2 (4.0) Other 0 1 (5.6) 1 (11.1) 0 0 0 2 (4.0) BRAF inhibitor 0 3 (16.7) 0 0 0 1 (14.3) 4 (8.0) Chemotherapy 0 2 (11.1) 0 1 (14.3) 0 2 (28.6) 5 (10.0) Other 0 4 (22.2) 1 (11.1) 2 (28.6) 1 (100.0) 1 (14.3) 9 (18.0) BID twice daily, CNS central nervous system, cont ’ continuous, ECOG PS Eastern Cooperative Oncology Group performance status, IL-2 interleukin 2, int’ intermittent, LDH lactate dehydrogenase a Epacadostat 100-mg BID and 300-mg BID dose cohorts were not re-explored in this study after protocol amendment to evaluate lower doses of epacadostat b Patient was incorrectly staged as IIIB by study site; this patient had metastases in the liver and therefore should have been reported as stage IV"
          }
        ]
      }
    }
  },
  {
    "id": "reviewed-30567529:1:3",
    "pmid": "30567529",
    "samples": [
      "16"
    ],
    "contexts": [
      {
        "stage": "R2",
        "source": "1c5cd0adc6fcd4cda4a2f57e852f234f3def3bcb469328097bbd89c47206a307",
        "binding": "f8e359b35600cdde91ebdd8edcb60a7df5513ce80cc40df698c5f6f7fc605b5e",
        "population": "p1",
        "comparator": null,
        "intervention": "a1"
      },
      {
        "stage": "R3",
        "source": "e2e2ee59d8c1400386452fcafab7039580ac407138844806eaed6e3b971d0051",
        "binding": "ebed128ebf9d376093c216d7bcf8bfa3f7e6ff430607fd132ad0656fd28f7f9b",
        "population": "p3",
        "comparator": null,
        "intervention": "a1"
      }
    ],
    "preferred_context": 1,
    "evidence": [
      {
        "id": "CE-ebed128ebf9d376093c216d7-span-4da5dc78da6d25436785748f",
        "source_id": "report-db5010ad58be4ddc1a761b7e:main:c0d1db1d47888821",
        "block_id": "b00021",
        "supporting_quote": "Forty-four patients were screened for eligibility. Eighteen patients were eligible and enrolled between March 2011 and March 2014. Follow-up was continued until October 2017 when the last patient completed maintenance therapy. One patient withdrew consent prior to initiation of therapy. Seventeen patients were evaluable for safety and sixteen for response because one patient received one cycle of HDIL-2 without ever receiving the MAGE-A3 CI. As shown in Table 1 , most patients had Stage IV disease, including 35% with M1c disease. Table 1 Patient demographics and clinical characteristics Characteristic Age, Mean, y (range) 55 (30–64) Sex Male, No. (%) 10 (59) Female, No. (%) 7 (41) Stage, No. (%) Unresectable III 8 (47) M1a 2 (12) M1b 1 (6) M1c 6 (35) ECOG PS, No. (%) 0 15 (88) 1 2 (12) LDH, No. (%) Normal 12 (71) >ULN 5 (29) Mutation status BRAF V600E/K 12 (71) C-KIT 1 (6) NRAS Q61R 1 (6) WT 3 (18) Abbreviations: ECOG PS Eastern Cooperative Oncology Group performance status, LDH lactate dehydrogenase, No number, ULN upper limit of normal"
      }
    ],
    "reason": "Same16 response-evaluable patients; full text distinguishes them from17 safety-evaluable and18 enrolled."
  },
  {
    "id": "reviewed-29632737:1:3",
    "pmid": "29632737",
    "samples": [
      "21"
    ],
    "contexts": [
      {
        "stage": "R2",
        "source": "4c81e4d2f02586277c9fa8da4a8db37ea52789d23bf83296940481fe87b03013",
        "binding": "862f8e7f201330629530e9eab39de0a4dac0cd5136ac8bd04b4ec20d5f597df3",
        "population": "p1",
        "comparator": null,
        "intervention": "a1"
      },
      {
        "stage": "R3",
        "source": "e0cb9da4f88bfdd20afec83f13a0cd130b678e89f84a0be326ebc90ad97352e4",
        "binding": "cd769eb5c32574d5bc77837abfeed584a4a5887f4f1f352777bb0c7a5763398d",
        "population": "p2",
        "comparator": null,
        "intervention": "a1"
      }
    ],
    "preferred_context": 1,
    "evidence": [
      {
        "id": "CE-cd769eb5c32574d5bc77837a-span-6b655c13eeae335cb1691d4f",
        "source_id": "report-146bf39c9303c71958dadceb:main:e085b933c2900c7b",
        "block_id": "b00023",
        "supporting_quote": "Taken together, these results show that MI therapy effectively induced melanoma-specific antibody responses and T-cell reactivity and regression of treated cutaneous metastases in 8 of 21 patients after 12 weeks (38%) and in 11 of 21 patients (52%) upon prolonged treatment."
      }
    ],
    "reason": "Same21-person local-response cohort; source reports8/21 at12weeks and11/21 with prolonged treatment. Time-specific results must remain labeled."
  },
  {
    "id": "reviewed-29552014:1:4",
    "pmid": "29552014",
    "samples": [
      "2"
    ],
    "contexts": [
      {
        "stage": "R2",
        "source": "b24abf28f7314753d87ad3c9fa867c70a952f37a300fbf5a51d7bf33bb9f726c",
        "binding": "9d9270859349e419dd396fd9428939dbf3c872edc178aafea9b2196ddeeaaf4c",
        "population": "p2",
        "comparator": null,
        "intervention": "a1"
      },
      {
        "stage": "R3",
        "source": "b28ae40e5526756e758f30a52b4025eb150d5da5b650d0b496ec0eae33e217e0",
        "binding": "c54fe39550512320f2f6e762157bde5444e037aa7ef1022b0df025ddb0ede6dd",
        "population": "p3",
        "comparator": null,
        "intervention": "a3"
      }
    ],
    "preferred_context": 1,
    "evidence": [
      {
        "id": "CE-9d9270859349e419dd396fd9-span-c6ec5bf7a34364a2bbcda042",
        "source_id": "report-411e705c033604931ee207ab:citation",
        "block_id": "abstract",
        "supporting_quote": "Immune checkpoint inhibitors (ICIs) have revolutionized the treatment of advanced melanoma. The first ICI to demonstrate clinical benefit, ipilimumab, targets cytotoxic T-lymphocyte-associated antigen-4 (CTLA-4); however, the long-term overall survival is just 22%. More than 40 years ago intralesional (IL) bacillus Calmette-Guérin (BCG), a living attenuated strain of Mycobacterium bovis, was found to induce tumor regression by stimulating cell-mediated immunity following a localized and self-limiting infection. We evaluated these two immune stimulants in combination with melanoma with the aim of developing a more effective immunotherapy and to assess toxicity. In this phase I study, patients with histologically confirmed stage III/IV metastatic melanoma received IL BCG injection followed by up to four cycles of intravenous ipilimumab (anti-CTLA-4) (ClinicalTrials.gov number NCT01838200). The trial was discontinued following treatment of the first five patients as the two patients receiving the escalation dose of BCG developed high-grade immune-related adverse events (irAEs) typical of ipilimumab monotherapy. These irAEs were characterized in both patients by profound increases in the repertoire of autoantibodies directed against both self- and cancer antigens. Interestingly, the induced autoantibodies were detected at time points that preceded the development of symptomatic toxicity. There was no overlap in the antigen specificity between patients and no evidence of clinical responses. Efforts to increase response rates through the use of novel immunotherapeutic combinations may be associated with higher rates of irAEs, thus the imperative to identify biomarkers of toxicity remains strong. While the small patient numbers in this trial do not allow for any conclusive evidence of predictive biomarkers, the observed changes warrant further examination of autoantibody repertoires in larger patient cohorts at risk of developing irAEs during their course of treatment. In summary, dose escalation of IL BCG followed by ipilimumab therapy was not well tolerated in advanced melanoma patients and showed no evidence of clinical benefit. Measuring autoantibody responses may provide early means for identifying patients at risk from developing severe irAEs during cancer immunotherapy."
      },
      {
        "id": "CE-c54fe39550512320f2f6e762-span-04d6f5120b5f57f64eba365c",
        "source_id": "report-411e705c033604931ee207ab:main:d5d767c86e5040e3",
        "block_id": "b00015",
        "supporting_quote": "This was a single-site, open-label phase I, dose-escalation study. Because of the potential for ipilimumab to amplify inflammatory responses mediated by BCG, a variety of safety precautions were taken; eligible patients had a skin test for tuberculin reactivity with purified protein derivative and were enrolled in one of two cohorts, depending on the size of the induration. Patients with an induration of <10 mm in diameter were enrolled in cohort 1 which utilized a 3 + 3 dose-escalation design. Patients with a reaction of ≥10 mm were enrolled in cohort 2. Enrollment of the first three patients was staggered by 3 weeks; subsequent patients were enrolled without delay. Patients enrolled in cohort 1, group 1, received 200 µl BCG (day 1, D1) containing 0.16–0.64 × 10 6 cfu, and patients in groups 2 and 3 received 200 µl BCG containing 0.80–3.20 × 10 6 cfu and 4.00–16.00 × 10 6 cfu, respectively. All patients enrolled in cohort 2 received 200 µl BCG containing 0.16–0.64 × 10 6 cfu BCG. To ensure that no active BCG infection was present at the time of ipilimumab administration, oral isoniazid of 300 mg/day was commenced on D29 and continued for 4 weeks in all patients. Ipilimumab was administered intravenously on D36 at a dose of 3 mg/kg every 3 weeks for a total of four doses. Patients with responding or a stable disease by RECIST v.1.1 or immune-related response criteria (irRC) were scheduled to receive ipilimumab as maintenance therapy administered at a 12-week interval for a further four doses (Figure 1 )."
      },
      {
        "id": "CE-c54fe39550512320f2f6e762-span-5189e3ed0f15442415c65954",
        "source_id": "report-411e705c033604931ee207ab:main:d5d767c86e5040e3",
        "block_id": "b00028",
        "supporting_quote": "Between April 2014 and June 2015, five patients were enrolled in the study. Cohort 1 included patients 1–3 in group 1 who received a 0.16–0.64 × 10 6 cfu BCG dose and patients 4 and 5 in group 2 who received a 0.80–3.20 × 10 6 cfu BCG dose. No patients were enrolled in planned group 3 or cohort 2. The mean age of patients was 59 years (range 43–71 years), with three males (60%). Two patients had a BRAF mutation and one patient a NRAS mutation. Two patients had prior immunotherapy with an NY-ESO-1 vaccine or pembrolizumab, and one patient had undergone prior targeted therapy with a BRAF inhibitor (Table 1 )."
      }
    ],
    "reason": "The abstract explicitly identifies two escalation-dose recipients; full text identifies them as patients4/5 in cohort1 group2, BCG0.80–3.20×10^6cfu. All patients also received isoniazid before ipilimumab. Preserve the distinct lower-dose cohort.",
    "treatment_preferences": {
      "intervention": {
        "context": 1,
        "reason": "The trial explicitly started isoniazid on day29 in all patients before ipilimumab on day36, following BCG. The reviewed escalation-dose cohort is the same two patients4/5.",
        "evidence": [
          {
            "id": "CE-c54fe39550512320f2f6e762-span-04d6f5120b5f57f64eba365c",
            "source_id": "report-411e705c033604931ee207ab:main:d5d767c86e5040e3",
            "block_id": "b00015",
            "supporting_quote": "This was a single-site, open-label phase I, dose-escalation study. Because of the potential for ipilimumab to amplify inflammatory responses mediated by BCG, a variety of safety precautions were taken; eligible patients had a skin test for tuberculin reactivity with purified protein derivative and were enrolled in one of two cohorts, depending on the size of the induration. Patients with an induration of <10 mm in diameter were enrolled in cohort 1 which utilized a 3 + 3 dose-escalation design. Patients with a reaction of ≥10 mm were enrolled in cohort 2. Enrollment of the first three patients was staggered by 3 weeks; subsequent patients were enrolled without delay. Patients enrolled in cohort 1, group 1, received 200 µl BCG (day 1, D1) containing 0.16–0.64 × 10 6 cfu, and patients in groups 2 and 3 received 200 µl BCG containing 0.80–3.20 × 10 6 cfu and 4.00–16.00 × 10 6 cfu, respectively. All patients enrolled in cohort 2 received 200 µl BCG containing 0.16–0.64 × 10 6 cfu BCG. To ensure that no active BCG infection was present at the time of ipilimumab administration, oral isoniazid of 300 mg/day was commenced on D29 and continued for 4 weeks in all patients. Ipilimumab was administered intravenously on D36 at a dose of 3 mg/kg every 3 weeks for a total of four doses. Patients with responding or a stable disease by RECIST v.1.1 or immune-related response criteria (irRC) were scheduled to receive ipilimumab as maintenance therapy administered at a 12-week interval for a further four doses (Figure 1 )."
          },
          {
            "id": "CE-c54fe39550512320f2f6e762-span-5189e3ed0f15442415c65954",
            "source_id": "report-411e705c033604931ee207ab:main:d5d767c86e5040e3",
            "block_id": "b00028",
            "supporting_quote": "Between April 2014 and June 2015, five patients were enrolled in the study. Cohort 1 included patients 1–3 in group 1 who received a 0.16–0.64 × 10 6 cfu BCG dose and patients 4 and 5 in group 2 who received a 0.80–3.20 × 10 6 cfu BCG dose. No patients were enrolled in planned group 3 or cohort 2. The mean age of patients was 59 years (range 43–71 years), with three males (60%). Two patients had a BRAF mutation and one patient a NRAS mutation. Two patients had prior immunotherapy with an NY-ESO-1 vaccine or pembrolizumab, and one patient had undergone prior targeted therapy with a BRAF inhibitor (Table 1 )."
          }
        ]
      }
    }
  },
  {
    "id": "reviewed-27687304:1:10",
    "pmid": "27687304",
    "samples": [
      "52"
    ],
    "contexts": [
      {
        "stage": "R2",
        "source": "32b3e310a5646b0ff77d709b0d8601c964f686144c9791cce5b756d2f9503143",
        "binding": "4646845173c470b94947288b6ee73d482a96b0af2885af31b3a6d77a89d0319a",
        "population": "p_ad",
        "comparator": null,
        "intervention": "a1"
      },
      {
        "stage": "R3",
        "source": "b950b1616d2d44556b56c95e616ddbfb9b779699e7acce9a171430733018633a",
        "binding": "9639addb9669af500508f9902e38a2f3017d9b143043176735dd6d85df4ea9d5",
        "population": "r3_p_ad",
        "comparator": null,
        "intervention": "r3_a_ad"
      }
    ],
    "preferred_context": 1,
    "evidence": [
      {
        "id": "CE-9639addb9669af500508f990-span-3c66879b1cc8fbf43d46b702",
        "source_id": "report-4dc8065ee250c21dff2cc0e3:main-html:64a4777492f351ce",
        "block_id": "b00016",
        "supporting_quote": "One hundred and nineteen patients from 13 centers in Australia, USA and Europe that were treated with anti-PD-1 antibodies (109 pembrolizumab, 10 nivolumab) and had either preexisting autoimmune disorders ( N =52) or had developed significant toxicity with prior ipilimumab ( N =67) were examined. Ninety-five (80%) patients had received ipilimumab prior to anti-PD-1 antibodies. Three patients (2.5%) had uveal melanoma. At the time of analysis, 86 (72%) patients had at least 3 months of follow-up (median 4.7 months). The median PFS was 6.8 months (95% CI 3.6–10.0) and 31 (26%) patients had died (median OS not reached)."
      }
    ],
    "reason": "Same source-defined preexisting-autoimmunity52 and prior-ipilimumab-toxicity67 cohorts, treated with pembrolizumab or nivolumab."
  },
  {
    "id": "reviewed-27687304:2:11",
    "pmid": "27687304",
    "samples": [
      "67"
    ],
    "contexts": [
      {
        "stage": "R2",
        "source": "32b3e310a5646b0ff77d709b0d8601c964f686144c9791cce5b756d2f9503143",
        "binding": "4646845173c470b94947288b6ee73d482a96b0af2885af31b3a6d77a89d0319a",
        "population": "p_ipi",
        "comparator": null,
        "intervention": "a1"
      },
      {
        "stage": "R3",
        "source": "b950b1616d2d44556b56c95e616ddbfb9b779699e7acce9a171430733018633a",
        "binding": "9639addb9669af500508f9902e38a2f3017d9b143043176735dd6d85df4ea9d5",
        "population": "r3_p_ipi",
        "comparator": null,
        "intervention": "r3_a_ipi"
      }
    ],
    "preferred_context": 1,
    "evidence": [
      {
        "id": "CE-9639addb9669af500508f990-span-3c66879b1cc8fbf43d46b702",
        "source_id": "report-4dc8065ee250c21dff2cc0e3:main-html:64a4777492f351ce",
        "block_id": "b00016",
        "supporting_quote": "One hundred and nineteen patients from 13 centers in Australia, USA and Europe that were treated with anti-PD-1 antibodies (109 pembrolizumab, 10 nivolumab) and had either preexisting autoimmune disorders ( N =52) or had developed significant toxicity with prior ipilimumab ( N =67) were examined. Ninety-five (80%) patients had received ipilimumab prior to anti-PD-1 antibodies. Three patients (2.5%) had uveal melanoma. At the time of analysis, 86 (72%) patients had at least 3 months of follow-up (median 4.7 months). The median PFS was 6.8 months (95% CI 3.6–10.0) and 31 (26%) patients had died (median OS not reached)."
      }
    ],
    "reason": "Same source-defined preexisting-autoimmunity52 and prior-ipilimumab-toxicity67 cohorts, treated with pembrolizumab or nivolumab."
  },
  {
    "id": "reviewed-27687304:4:25",
    "pmid": "27687304",
    "samples": [
      "3"
    ],
    "contexts": [
      {
        "stage": "R2",
        "source": "32b3e310a5646b0ff77d709b0d8601c964f686144c9791cce5b756d2f9503143",
        "binding": "4646845173c470b94947288b6ee73d482a96b0af2885af31b3a6d77a89d0319a",
        "population": "p_pmr",
        "comparator": null,
        "intervention": "a1"
      },
      {
        "stage": "R3",
        "source": "b950b1616d2d44556b56c95e616ddbfb9b779699e7acce9a171430733018633a",
        "binding": "9639addb9669af500508f9902e38a2f3017d9b143043176735dd6d85df4ea9d5",
        "population": "r3_p_pmr",
        "comparator": null,
        "intervention": "r3_a_ad"
      }
    ],
    "preferred_context": 1,
    "evidence": [
      {
        "id": "CE-9639addb9669af500508f990-span-ae05fa74b9c72c497987b62c",
        "source_id": "report-4dc8065ee250c21dff2cc0e3:main-html:64a4777492f351ce",
        "block_id": "b00022",
        "supporting_quote": "<section class=\"tw xbox font-sm\" id=\"t0015\"><h4 class=\"obj_head\">Table 2.</h4>\n<div class=\"caption p\"><p>Toxicity of anti-PD-1 antibodies in patients with autoimmune disorders</p></div>\n<div class=\"tbl-box p\" tabindex=\"0\"><table class=\"content\" frame=\"hsides\" rules=\"groups\">\n<thead><tr>\n<th align=\"left\" colspan=\"1\" rowspan=\"1\"></th>\n<th align=\"left\" colspan=\"1\" rowspan=\"1\">Number (%) (<em>N</em> = 52)</th>\n<th align=\"left\" colspan=\"1\" rowspan=\"1\">Details</th>\n</tr></thead>\n<tbody>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Flare AD on PD1</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">No</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">32 (62%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Yes</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">20 (38%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Time to flare, median (range), d</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">38 (8–161)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Grade of flare</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">G1-2</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">17 (33%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">G3</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">3 (6%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">G4</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">0 (0%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Flare by AD subtype</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Rheumatologic</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">14 of 27 (52%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">7/13 RA, 3/3 PMR, 1/2 scleroderma, 2/2 Sjogren's, 1/2 psoriatic arthritis</td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Dermatologic</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">3 of 8 (38%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">3/6 psoriasis</td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Gastrointestinal</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">0 of 6 (0%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Neurologic</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">0 of 5 (0%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Endocrine</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">1 of 4 (25%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">1/4 Graves</td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Respiratory</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">0 of 2 (0%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Hematologic</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">2 of 2 (100%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">2/2 ITP</td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Flare by AD stability at start of PD1</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Clinically active</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">9 of 15 (60%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Clinically inactive</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">11 of 37 (30%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">On immunosuppression</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">10 of 20 (50%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Not on immunosuppression</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">10 of 32 (31%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Immunosuppression required for AD flare</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">oral steroids</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">11 (21%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">SSA</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">6 (12%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Steroids and SSA</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">2 (4%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">IVIG</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">1 (2%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">PD1 dosing with AD flare</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Continue</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">10 (20%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Interrupt</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">8 (15%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">permanently discontinue</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">2 (4%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Conventional irAE</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">No</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">37 (71%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Yes</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">15 (29%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">G1-2</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">10 (20%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">G3</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">5 (10%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">2 hepatitis, 1 colitis, pancreatitis and pneumonitis</td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Immunosuppression required for irAE</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Symptomatic management</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">8 (15%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Oral steroids</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">4 (8%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">IV steroids</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">2 (4%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Steroids and SSA</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">1 (2%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">PD1 dosing with irAE</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Continue</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">8 (15%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Interrupt</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">3 (6%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Permanently discontinue</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">4 (8%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n</tbody>\n</table></div>\n<div class=\"p text-right font-secondary\"><a href=\"table/t0015/\" class=\"usa-link\" target=\"_blank\" rel=\"noopener noreferrer\">Open in a new tab</a></div>\n<div class=\"tw-foot p\"><div class=\"fn\" id=\"fn5\"><p>AD, autoimmune disorder; PD1, anti-PD-1 antibody; irAE, immune-related adverse event; SSA, steroid-sparing agent; IVIG, intravenous immunoglobulin.</p></div></div></section>"
      },
      {
        "id": "CE-9639addb9669af500508f990-span-fde6ff5ca95cce2f48f851dd",
        "source_id": "report-4dc8065ee250c21dff2cc0e3:main-html:64a4777492f351ce",
        "block_id": "b00019",
        "supporting_quote": "<section class=\"tw xbox font-sm\" id=\"t0010\"><h4 class=\"obj_head\">Table 1.</h4>\n<div class=\"caption p\"><p>Characteristics of patients with autoimmune disorders</p></div>\n<div class=\"tbl-box p\" tabindex=\"0\"><table class=\"content\" frame=\"hsides\" rules=\"groups\">\n<thead><tr>\n<th align=\"left\" colspan=\"1\" rowspan=\"1\"></th>\n<th align=\"left\" colspan=\"1\" rowspan=\"1\">Number (%) (<em>N</em>=52)</th>\n<th align=\"left\" colspan=\"1\" rowspan=\"1\">Details</th>\n</tr></thead>\n<tbody>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Demographics and disease characteristics</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Age, median (range), y</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">71 (23–88)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Males</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">31 (60%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">AJCC stage M1c</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">44 (85%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Brain metastases</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">16 (31%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Elevated serum LDH</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">25 (48%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">ECOG≥1</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">29 (56%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Prior ipilimumab treatment</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">28 (54%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">No prior systemic therapy</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">23 (44%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">AI disorder<a href=\"#tf0010\" class=\"usa-link\"><sup>a</sup></a>\n</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Rheumatologic</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">27 (52%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">RA 13, sarcoidosis 3, PMR 3, SLE 2, scleroderma 2, psoriatic arthritis 2, Sjogren's 2</td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Dermatologic</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">8 (15%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">psoriasis 6, eczema, erythema nodosum</td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Gastrointestinal</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">6 (12%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">CD 3, UC with colectomy 2, celiac disease 1</td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Neurologic</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">5 (10%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">GBS 2, CIDP 1, MG 1, Bell's palsy 1</td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Endocrine</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">4 (8%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Graves’ disease 4</td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Respiratory</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">2 (4%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Asthma 2 (1 severe on long-term oral steroids)</td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Hematologic</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">2 (4%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">ITP 2</td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Activity of AI disorder at PD1 start</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Not clinically active</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">37 (71%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Clinically active</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">15 (29%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">11 rheumatologic (RA 5, psoriatic arthritis 2, Sjogrens 2, sarcoidosis 1, PMR 1), 3 psoriasis, 1 severe asthma</td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Treatment of AI disorder at PD1 start</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">No immunosuppresion</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">32 (62%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Corticosteroids</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">9 (17%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Steroid-sparing agent</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">5 (10%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Mesalamine 2, leflunomide, hydroxychloroquine, apremilast</td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Steroids and SSAs</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">5 (10%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Sulfasalazine, leflunomide, hydroxychloroquine, methotrexate, ibuprofen</td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">IVIG</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">1 (2%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n</tbody>\n</table></div>\n<div class=\"p text-right font-secondary\"><a href=\"table/t0010/\" class=\"usa-link\" target=\"_blank\" rel=\"noopener noreferrer\">Open in a new tab</a></div>\n<div class=\"tw-foot p\">\n<div class=\"fn\" id=\"sp0020\"><p>Data are given as number (percentage) unless otherwise specified.</p></div>\n<div class=\"fn\" id=\"sp0025\"><p>RA, rheumatoid arthritis; PMR, polymyalgia rheumatica; SLE, systemic lupus erythematosus; CD, Crohn’s disease; UC, ulcerative colitis; GBS, Guillain-Barre syndrome; CIDP, chronic inflammatory demyelinating polyneuropathy; MG, myasthenia gravis; ITP, immune thrombocytopenia purpura; SSA, steroid-sparing agent.</p></div>\n<div class=\"fn\" id=\"tf0010\">\n<sup>a</sup><p class=\"display-inline\" id=\"np0010\">Total exceeds 52 because 2 patients had 2 disorders.</p>\n</div>\n</div></section>"
      }
    ],
    "reason": "Exact diagnosis matches PMR3, Sjogren2 and ITP2 are the same source strata; other equal-N diagnoses remain distinct."
  },
  {
    "id": "reviewed-27687304:5:27",
    "pmid": "27687304",
    "samples": [
      "2"
    ],
    "contexts": [
      {
        "stage": "R2",
        "source": "32b3e310a5646b0ff77d709b0d8601c964f686144c9791cce5b756d2f9503143",
        "binding": "4646845173c470b94947288b6ee73d482a96b0af2885af31b3a6d77a89d0319a",
        "population": "p_sjogren",
        "comparator": null,
        "intervention": "a1"
      },
      {
        "stage": "R3",
        "source": "b950b1616d2d44556b56c95e616ddbfb9b779699e7acce9a171430733018633a",
        "binding": "9639addb9669af500508f9902e38a2f3017d9b143043176735dd6d85df4ea9d5",
        "population": "r3_p_sjogren",
        "comparator": null,
        "intervention": "r3_a_ad"
      }
    ],
    "preferred_context": 1,
    "evidence": [
      {
        "id": "CE-9639addb9669af500508f990-span-ae05fa74b9c72c497987b62c",
        "source_id": "report-4dc8065ee250c21dff2cc0e3:main-html:64a4777492f351ce",
        "block_id": "b00022",
        "supporting_quote": "<section class=\"tw xbox font-sm\" id=\"t0015\"><h4 class=\"obj_head\">Table 2.</h4>\n<div class=\"caption p\"><p>Toxicity of anti-PD-1 antibodies in patients with autoimmune disorders</p></div>\n<div class=\"tbl-box p\" tabindex=\"0\"><table class=\"content\" frame=\"hsides\" rules=\"groups\">\n<thead><tr>\n<th align=\"left\" colspan=\"1\" rowspan=\"1\"></th>\n<th align=\"left\" colspan=\"1\" rowspan=\"1\">Number (%) (<em>N</em> = 52)</th>\n<th align=\"left\" colspan=\"1\" rowspan=\"1\">Details</th>\n</tr></thead>\n<tbody>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Flare AD on PD1</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">No</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">32 (62%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Yes</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">20 (38%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Time to flare, median (range), d</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">38 (8–161)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Grade of flare</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">G1-2</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">17 (33%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">G3</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">3 (6%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">G4</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">0 (0%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Flare by AD subtype</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Rheumatologic</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">14 of 27 (52%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">7/13 RA, 3/3 PMR, 1/2 scleroderma, 2/2 Sjogren's, 1/2 psoriatic arthritis</td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Dermatologic</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">3 of 8 (38%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">3/6 psoriasis</td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Gastrointestinal</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">0 of 6 (0%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Neurologic</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">0 of 5 (0%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Endocrine</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">1 of 4 (25%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">1/4 Graves</td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Respiratory</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">0 of 2 (0%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Hematologic</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">2 of 2 (100%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">2/2 ITP</td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Flare by AD stability at start of PD1</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Clinically active</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">9 of 15 (60%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Clinically inactive</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">11 of 37 (30%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">On immunosuppression</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">10 of 20 (50%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Not on immunosuppression</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">10 of 32 (31%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Immunosuppression required for AD flare</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">oral steroids</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">11 (21%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">SSA</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">6 (12%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Steroids and SSA</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">2 (4%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">IVIG</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">1 (2%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">PD1 dosing with AD flare</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Continue</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">10 (20%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Interrupt</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">8 (15%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">permanently discontinue</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">2 (4%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Conventional irAE</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">No</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">37 (71%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Yes</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">15 (29%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">G1-2</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">10 (20%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">G3</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">5 (10%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">2 hepatitis, 1 colitis, pancreatitis and pneumonitis</td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Immunosuppression required for irAE</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Symptomatic management</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">8 (15%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Oral steroids</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">4 (8%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">IV steroids</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">2 (4%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Steroids and SSA</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">1 (2%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">PD1 dosing with irAE</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Continue</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">8 (15%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Interrupt</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">3 (6%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Permanently discontinue</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">4 (8%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n</tbody>\n</table></div>\n<div class=\"p text-right font-secondary\"><a href=\"table/t0015/\" class=\"usa-link\" target=\"_blank\" rel=\"noopener noreferrer\">Open in a new tab</a></div>\n<div class=\"tw-foot p\"><div class=\"fn\" id=\"fn5\"><p>AD, autoimmune disorder; PD1, anti-PD-1 antibody; irAE, immune-related adverse event; SSA, steroid-sparing agent; IVIG, intravenous immunoglobulin.</p></div></div></section>"
      },
      {
        "id": "CE-9639addb9669af500508f990-span-fde6ff5ca95cce2f48f851dd",
        "source_id": "report-4dc8065ee250c21dff2cc0e3:main-html:64a4777492f351ce",
        "block_id": "b00019",
        "supporting_quote": "<section class=\"tw xbox font-sm\" id=\"t0010\"><h4 class=\"obj_head\">Table 1.</h4>\n<div class=\"caption p\"><p>Characteristics of patients with autoimmune disorders</p></div>\n<div class=\"tbl-box p\" tabindex=\"0\"><table class=\"content\" frame=\"hsides\" rules=\"groups\">\n<thead><tr>\n<th align=\"left\" colspan=\"1\" rowspan=\"1\"></th>\n<th align=\"left\" colspan=\"1\" rowspan=\"1\">Number (%) (<em>N</em>=52)</th>\n<th align=\"left\" colspan=\"1\" rowspan=\"1\">Details</th>\n</tr></thead>\n<tbody>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Demographics and disease characteristics</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Age, median (range), y</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">71 (23–88)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Males</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">31 (60%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">AJCC stage M1c</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">44 (85%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Brain metastases</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">16 (31%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Elevated serum LDH</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">25 (48%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">ECOG≥1</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">29 (56%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Prior ipilimumab treatment</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">28 (54%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">No prior systemic therapy</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">23 (44%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">AI disorder<a href=\"#tf0010\" class=\"usa-link\"><sup>a</sup></a>\n</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Rheumatologic</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">27 (52%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">RA 13, sarcoidosis 3, PMR 3, SLE 2, scleroderma 2, psoriatic arthritis 2, Sjogren's 2</td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Dermatologic</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">8 (15%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">psoriasis 6, eczema, erythema nodosum</td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Gastrointestinal</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">6 (12%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">CD 3, UC with colectomy 2, celiac disease 1</td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Neurologic</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">5 (10%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">GBS 2, CIDP 1, MG 1, Bell's palsy 1</td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Endocrine</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">4 (8%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Graves’ disease 4</td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Respiratory</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">2 (4%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Asthma 2 (1 severe on long-term oral steroids)</td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Hematologic</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">2 (4%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">ITP 2</td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Activity of AI disorder at PD1 start</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Not clinically active</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">37 (71%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Clinically active</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">15 (29%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">11 rheumatologic (RA 5, psoriatic arthritis 2, Sjogrens 2, sarcoidosis 1, PMR 1), 3 psoriasis, 1 severe asthma</td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Treatment of AI disorder at PD1 start</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">No immunosuppresion</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">32 (62%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Corticosteroids</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">9 (17%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Steroid-sparing agent</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">5 (10%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Mesalamine 2, leflunomide, hydroxychloroquine, apremilast</td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Steroids and SSAs</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">5 (10%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Sulfasalazine, leflunomide, hydroxychloroquine, methotrexate, ibuprofen</td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">IVIG</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">1 (2%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n</tbody>\n</table></div>\n<div class=\"p text-right font-secondary\"><a href=\"table/t0010/\" class=\"usa-link\" target=\"_blank\" rel=\"noopener noreferrer\">Open in a new tab</a></div>\n<div class=\"tw-foot p\">\n<div class=\"fn\" id=\"sp0020\"><p>Data are given as number (percentage) unless otherwise specified.</p></div>\n<div class=\"fn\" id=\"sp0025\"><p>RA, rheumatoid arthritis; PMR, polymyalgia rheumatica; SLE, systemic lupus erythematosus; CD, Crohn’s disease; UC, ulcerative colitis; GBS, Guillain-Barre syndrome; CIDP, chronic inflammatory demyelinating polyneuropathy; MG, myasthenia gravis; ITP, immune thrombocytopenia purpura; SSA, steroid-sparing agent.</p></div>\n<div class=\"fn\" id=\"tf0010\">\n<sup>a</sup><p class=\"display-inline\" id=\"np0010\">Total exceeds 52 because 2 patients had 2 disorders.</p>\n</div>\n</div></section>"
      }
    ],
    "reason": "Exact diagnosis matches PMR3, Sjogren2 and ITP2 are the same source strata; other equal-N diagnoses remain distinct."
  },
  {
    "id": "reviewed-27687304:6:24",
    "pmid": "27687304",
    "samples": [
      "2"
    ],
    "contexts": [
      {
        "stage": "R2",
        "source": "32b3e310a5646b0ff77d709b0d8601c964f686144c9791cce5b756d2f9503143",
        "binding": "4646845173c470b94947288b6ee73d482a96b0af2885af31b3a6d77a89d0319a",
        "population": "p_itp",
        "comparator": null,
        "intervention": "a1"
      },
      {
        "stage": "R3",
        "source": "b950b1616d2d44556b56c95e616ddbfb9b779699e7acce9a171430733018633a",
        "binding": "9639addb9669af500508f9902e38a2f3017d9b143043176735dd6d85df4ea9d5",
        "population": "r3_p_heme",
        "comparator": null,
        "intervention": "r3_a_ad"
      }
    ],
    "preferred_context": 0,
    "evidence": [
      {
        "id": "CE-9639addb9669af500508f990-span-ae05fa74b9c72c497987b62c",
        "source_id": "report-4dc8065ee250c21dff2cc0e3:main-html:64a4777492f351ce",
        "block_id": "b00022",
        "supporting_quote": "<section class=\"tw xbox font-sm\" id=\"t0015\"><h4 class=\"obj_head\">Table 2.</h4>\n<div class=\"caption p\"><p>Toxicity of anti-PD-1 antibodies in patients with autoimmune disorders</p></div>\n<div class=\"tbl-box p\" tabindex=\"0\"><table class=\"content\" frame=\"hsides\" rules=\"groups\">\n<thead><tr>\n<th align=\"left\" colspan=\"1\" rowspan=\"1\"></th>\n<th align=\"left\" colspan=\"1\" rowspan=\"1\">Number (%) (<em>N</em> = 52)</th>\n<th align=\"left\" colspan=\"1\" rowspan=\"1\">Details</th>\n</tr></thead>\n<tbody>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Flare AD on PD1</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">No</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">32 (62%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Yes</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">20 (38%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Time to flare, median (range), d</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">38 (8–161)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Grade of flare</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">G1-2</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">17 (33%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">G3</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">3 (6%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">G4</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">0 (0%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Flare by AD subtype</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Rheumatologic</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">14 of 27 (52%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">7/13 RA, 3/3 PMR, 1/2 scleroderma, 2/2 Sjogren's, 1/2 psoriatic arthritis</td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Dermatologic</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">3 of 8 (38%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">3/6 psoriasis</td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Gastrointestinal</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">0 of 6 (0%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Neurologic</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">0 of 5 (0%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Endocrine</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">1 of 4 (25%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">1/4 Graves</td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Respiratory</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">0 of 2 (0%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Hematologic</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">2 of 2 (100%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">2/2 ITP</td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Flare by AD stability at start of PD1</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Clinically active</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">9 of 15 (60%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Clinically inactive</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">11 of 37 (30%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">On immunosuppression</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">10 of 20 (50%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Not on immunosuppression</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">10 of 32 (31%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Immunosuppression required for AD flare</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">oral steroids</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">11 (21%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">SSA</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">6 (12%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Steroids and SSA</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">2 (4%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">IVIG</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">1 (2%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">PD1 dosing with AD flare</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Continue</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">10 (20%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Interrupt</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">8 (15%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">permanently discontinue</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">2 (4%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Conventional irAE</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">No</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">37 (71%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Yes</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">15 (29%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">G1-2</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">10 (20%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">G3</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">5 (10%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">2 hepatitis, 1 colitis, pancreatitis and pneumonitis</td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Immunosuppression required for irAE</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Symptomatic management</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">8 (15%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Oral steroids</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">4 (8%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">IV steroids</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">2 (4%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Steroids and SSA</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">1 (2%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">PD1 dosing with irAE</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Continue</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">8 (15%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Interrupt</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">3 (6%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Permanently discontinue</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">4 (8%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n</tbody>\n</table></div>\n<div class=\"p text-right font-secondary\"><a href=\"table/t0015/\" class=\"usa-link\" target=\"_blank\" rel=\"noopener noreferrer\">Open in a new tab</a></div>\n<div class=\"tw-foot p\"><div class=\"fn\" id=\"fn5\"><p>AD, autoimmune disorder; PD1, anti-PD-1 antibody; irAE, immune-related adverse event; SSA, steroid-sparing agent; IVIG, intravenous immunoglobulin.</p></div></div></section>"
      },
      {
        "id": "CE-9639addb9669af500508f990-span-fde6ff5ca95cce2f48f851dd",
        "source_id": "report-4dc8065ee250c21dff2cc0e3:main-html:64a4777492f351ce",
        "block_id": "b00019",
        "supporting_quote": "<section class=\"tw xbox font-sm\" id=\"t0010\"><h4 class=\"obj_head\">Table 1.</h4>\n<div class=\"caption p\"><p>Characteristics of patients with autoimmune disorders</p></div>\n<div class=\"tbl-box p\" tabindex=\"0\"><table class=\"content\" frame=\"hsides\" rules=\"groups\">\n<thead><tr>\n<th align=\"left\" colspan=\"1\" rowspan=\"1\"></th>\n<th align=\"left\" colspan=\"1\" rowspan=\"1\">Number (%) (<em>N</em>=52)</th>\n<th align=\"left\" colspan=\"1\" rowspan=\"1\">Details</th>\n</tr></thead>\n<tbody>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Demographics and disease characteristics</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Age, median (range), y</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">71 (23–88)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Males</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">31 (60%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">AJCC stage M1c</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">44 (85%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Brain metastases</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">16 (31%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Elevated serum LDH</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">25 (48%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">ECOG≥1</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">29 (56%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Prior ipilimumab treatment</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">28 (54%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">No prior systemic therapy</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">23 (44%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">AI disorder<a href=\"#tf0010\" class=\"usa-link\"><sup>a</sup></a>\n</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Rheumatologic</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">27 (52%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">RA 13, sarcoidosis 3, PMR 3, SLE 2, scleroderma 2, psoriatic arthritis 2, Sjogren's 2</td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Dermatologic</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">8 (15%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">psoriasis 6, eczema, erythema nodosum</td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Gastrointestinal</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">6 (12%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">CD 3, UC with colectomy 2, celiac disease 1</td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Neurologic</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">5 (10%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">GBS 2, CIDP 1, MG 1, Bell's palsy 1</td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Endocrine</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">4 (8%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Graves’ disease 4</td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Respiratory</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">2 (4%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Asthma 2 (1 severe on long-term oral steroids)</td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Hematologic</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">2 (4%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">ITP 2</td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Activity of AI disorder at PD1 start</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Not clinically active</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">37 (71%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Clinically active</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">15 (29%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">11 rheumatologic (RA 5, psoriatic arthritis 2, Sjogrens 2, sarcoidosis 1, PMR 1), 3 psoriasis, 1 severe asthma</td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Treatment of AI disorder at PD1 start</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">No immunosuppresion</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">32 (62%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Corticosteroids</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">9 (17%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Steroid-sparing agent</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">5 (10%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Mesalamine 2, leflunomide, hydroxychloroquine, apremilast</td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Steroids and SSAs</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">5 (10%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Sulfasalazine, leflunomide, hydroxychloroquine, methotrexate, ibuprofen</td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">IVIG</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">1 (2%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n</tbody>\n</table></div>\n<div class=\"p text-right font-secondary\"><a href=\"table/t0010/\" class=\"usa-link\" target=\"_blank\" rel=\"noopener noreferrer\">Open in a new tab</a></div>\n<div class=\"tw-foot p\">\n<div class=\"fn\" id=\"sp0020\"><p>Data are given as number (percentage) unless otherwise specified.</p></div>\n<div class=\"fn\" id=\"sp0025\"><p>RA, rheumatoid arthritis; PMR, polymyalgia rheumatica; SLE, systemic lupus erythematosus; CD, Crohn’s disease; UC, ulcerative colitis; GBS, Guillain-Barre syndrome; CIDP, chronic inflammatory demyelinating polyneuropathy; MG, myasthenia gravis; ITP, immune thrombocytopenia purpura; SSA, steroid-sparing agent.</p></div>\n<div class=\"fn\" id=\"tf0010\">\n<sup>a</sup><p class=\"display-inline\" id=\"np0010\">Total exceeds 52 because 2 patients had 2 disorders.</p>\n</div>\n</div></section>"
      }
    ],
    "reason": "The table explicitly states hematologic autoimmune disorders2 are ITP2; the more specific ITP label is appropriate."
  },
  {
    "id": "reviewed-27687304:6:30",
    "pmid": "27687304",
    "samples": [
      "2"
    ],
    "contexts": [
      {
        "stage": "R2",
        "source": "32b3e310a5646b0ff77d709b0d8601c964f686144c9791cce5b756d2f9503143",
        "binding": "4646845173c470b94947288b6ee73d482a96b0af2885af31b3a6d77a89d0319a",
        "population": "p_itp",
        "comparator": null,
        "intervention": "a1"
      },
      {
        "stage": "R3",
        "source": "b950b1616d2d44556b56c95e616ddbfb9b779699e7acce9a171430733018633a",
        "binding": "9639addb9669af500508f9902e38a2f3017d9b143043176735dd6d85df4ea9d5",
        "population": "r3_p_itp",
        "comparator": null,
        "intervention": "r3_a_ad"
      }
    ],
    "preferred_context": 1,
    "evidence": [
      {
        "id": "CE-9639addb9669af500508f990-span-ae05fa74b9c72c497987b62c",
        "source_id": "report-4dc8065ee250c21dff2cc0e3:main-html:64a4777492f351ce",
        "block_id": "b00022",
        "supporting_quote": "<section class=\"tw xbox font-sm\" id=\"t0015\"><h4 class=\"obj_head\">Table 2.</h4>\n<div class=\"caption p\"><p>Toxicity of anti-PD-1 antibodies in patients with autoimmune disorders</p></div>\n<div class=\"tbl-box p\" tabindex=\"0\"><table class=\"content\" frame=\"hsides\" rules=\"groups\">\n<thead><tr>\n<th align=\"left\" colspan=\"1\" rowspan=\"1\"></th>\n<th align=\"left\" colspan=\"1\" rowspan=\"1\">Number (%) (<em>N</em> = 52)</th>\n<th align=\"left\" colspan=\"1\" rowspan=\"1\">Details</th>\n</tr></thead>\n<tbody>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Flare AD on PD1</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">No</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">32 (62%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Yes</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">20 (38%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Time to flare, median (range), d</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">38 (8–161)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Grade of flare</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">G1-2</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">17 (33%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">G3</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">3 (6%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">G4</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">0 (0%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Flare by AD subtype</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Rheumatologic</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">14 of 27 (52%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">7/13 RA, 3/3 PMR, 1/2 scleroderma, 2/2 Sjogren's, 1/2 psoriatic arthritis</td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Dermatologic</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">3 of 8 (38%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">3/6 psoriasis</td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Gastrointestinal</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">0 of 6 (0%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Neurologic</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">0 of 5 (0%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Endocrine</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">1 of 4 (25%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">1/4 Graves</td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Respiratory</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">0 of 2 (0%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Hematologic</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">2 of 2 (100%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">2/2 ITP</td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Flare by AD stability at start of PD1</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Clinically active</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">9 of 15 (60%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Clinically inactive</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">11 of 37 (30%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">On immunosuppression</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">10 of 20 (50%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Not on immunosuppression</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">10 of 32 (31%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Immunosuppression required for AD flare</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">oral steroids</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">11 (21%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">SSA</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">6 (12%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Steroids and SSA</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">2 (4%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">IVIG</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">1 (2%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">PD1 dosing with AD flare</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Continue</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">10 (20%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Interrupt</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">8 (15%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">permanently discontinue</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">2 (4%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Conventional irAE</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">No</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">37 (71%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Yes</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">15 (29%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">G1-2</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">10 (20%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">G3</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">5 (10%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">2 hepatitis, 1 colitis, pancreatitis and pneumonitis</td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Immunosuppression required for irAE</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Symptomatic management</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">8 (15%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Oral steroids</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">4 (8%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">IV steroids</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">2 (4%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Steroids and SSA</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">1 (2%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">PD1 dosing with irAE</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Continue</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">8 (15%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Interrupt</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">3 (6%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Permanently discontinue</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">4 (8%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n</tbody>\n</table></div>\n<div class=\"p text-right font-secondary\"><a href=\"table/t0015/\" class=\"usa-link\" target=\"_blank\" rel=\"noopener noreferrer\">Open in a new tab</a></div>\n<div class=\"tw-foot p\"><div class=\"fn\" id=\"fn5\"><p>AD, autoimmune disorder; PD1, anti-PD-1 antibody; irAE, immune-related adverse event; SSA, steroid-sparing agent; IVIG, intravenous immunoglobulin.</p></div></div></section>"
      },
      {
        "id": "CE-9639addb9669af500508f990-span-fde6ff5ca95cce2f48f851dd",
        "source_id": "report-4dc8065ee250c21dff2cc0e3:main-html:64a4777492f351ce",
        "block_id": "b00019",
        "supporting_quote": "<section class=\"tw xbox font-sm\" id=\"t0010\"><h4 class=\"obj_head\">Table 1.</h4>\n<div class=\"caption p\"><p>Characteristics of patients with autoimmune disorders</p></div>\n<div class=\"tbl-box p\" tabindex=\"0\"><table class=\"content\" frame=\"hsides\" rules=\"groups\">\n<thead><tr>\n<th align=\"left\" colspan=\"1\" rowspan=\"1\"></th>\n<th align=\"left\" colspan=\"1\" rowspan=\"1\">Number (%) (<em>N</em>=52)</th>\n<th align=\"left\" colspan=\"1\" rowspan=\"1\">Details</th>\n</tr></thead>\n<tbody>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Demographics and disease characteristics</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Age, median (range), y</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">71 (23–88)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Males</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">31 (60%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">AJCC stage M1c</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">44 (85%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Brain metastases</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">16 (31%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Elevated serum LDH</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">25 (48%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">ECOG≥1</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">29 (56%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Prior ipilimumab treatment</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">28 (54%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">No prior systemic therapy</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">23 (44%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">AI disorder<a href=\"#tf0010\" class=\"usa-link\"><sup>a</sup></a>\n</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Rheumatologic</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">27 (52%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">RA 13, sarcoidosis 3, PMR 3, SLE 2, scleroderma 2, psoriatic arthritis 2, Sjogren's 2</td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Dermatologic</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">8 (15%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">psoriasis 6, eczema, erythema nodosum</td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Gastrointestinal</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">6 (12%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">CD 3, UC with colectomy 2, celiac disease 1</td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Neurologic</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">5 (10%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">GBS 2, CIDP 1, MG 1, Bell's palsy 1</td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Endocrine</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">4 (8%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Graves’ disease 4</td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Respiratory</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">2 (4%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Asthma 2 (1 severe on long-term oral steroids)</td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Hematologic</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">2 (4%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">ITP 2</td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Activity of AI disorder at PD1 start</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Not clinically active</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">37 (71%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Clinically active</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">15 (29%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">11 rheumatologic (RA 5, psoriatic arthritis 2, Sjogrens 2, sarcoidosis 1, PMR 1), 3 psoriasis, 1 severe asthma</td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Treatment of AI disorder at PD1 start</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">No immunosuppresion</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">32 (62%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Corticosteroids</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">9 (17%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Steroid-sparing agent</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">5 (10%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Mesalamine 2, leflunomide, hydroxychloroquine, apremilast</td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Steroids and SSAs</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">5 (10%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Sulfasalazine, leflunomide, hydroxychloroquine, methotrexate, ibuprofen</td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">IVIG</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">1 (2%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n</tbody>\n</table></div>\n<div class=\"p text-right font-secondary\"><a href=\"table/t0010/\" class=\"usa-link\" target=\"_blank\" rel=\"noopener noreferrer\">Open in a new tab</a></div>\n<div class=\"tw-foot p\">\n<div class=\"fn\" id=\"sp0020\"><p>Data are given as number (percentage) unless otherwise specified.</p></div>\n<div class=\"fn\" id=\"sp0025\"><p>RA, rheumatoid arthritis; PMR, polymyalgia rheumatica; SLE, systemic lupus erythematosus; CD, Crohn’s disease; UC, ulcerative colitis; GBS, Guillain-Barre syndrome; CIDP, chronic inflammatory demyelinating polyneuropathy; MG, myasthenia gravis; ITP, immune thrombocytopenia purpura; SSA, steroid-sparing agent.</p></div>\n<div class=\"fn\" id=\"tf0010\">\n<sup>a</sup><p class=\"display-inline\" id=\"np0010\">Total exceeds 52 because 2 patients had 2 disorders.</p>\n</div>\n</div></section>"
      }
    ],
    "reason": "Exact diagnosis matches PMR3, Sjogren2 and ITP2 are the same source strata; other equal-N diagnoses remain distinct."
  },
  {
    "id": "reviewed-27687304:7:19",
    "pmid": "27687304",
    "samples": [
      "8"
    ],
    "contexts": [
      {
        "stage": "R2",
        "source": "32b3e310a5646b0ff77d709b0d8601c964f686144c9791cce5b756d2f9503143",
        "binding": "4646845173c470b94947288b6ee73d482a96b0af2885af31b3a6d77a89d0319a",
        "population": "p_psoriasis",
        "comparator": null,
        "intervention": "a1"
      },
      {
        "stage": "R3",
        "source": "b950b1616d2d44556b56c95e616ddbfb9b779699e7acce9a171430733018633a",
        "binding": "9639addb9669af500508f9902e38a2f3017d9b143043176735dd6d85df4ea9d5",
        "population": "r3_p_derm",
        "comparator": null,
        "intervention": "r3_a_ad"
      }
    ],
    "preferred_context": 1,
    "evidence": [
      {
        "id": "CE-9639addb9669af500508f990-span-ae05fa74b9c72c497987b62c",
        "source_id": "report-4dc8065ee250c21dff2cc0e3:main-html:64a4777492f351ce",
        "block_id": "b00022",
        "supporting_quote": "<section class=\"tw xbox font-sm\" id=\"t0015\"><h4 class=\"obj_head\">Table 2.</h4>\n<div class=\"caption p\"><p>Toxicity of anti-PD-1 antibodies in patients with autoimmune disorders</p></div>\n<div class=\"tbl-box p\" tabindex=\"0\"><table class=\"content\" frame=\"hsides\" rules=\"groups\">\n<thead><tr>\n<th align=\"left\" colspan=\"1\" rowspan=\"1\"></th>\n<th align=\"left\" colspan=\"1\" rowspan=\"1\">Number (%) (<em>N</em> = 52)</th>\n<th align=\"left\" colspan=\"1\" rowspan=\"1\">Details</th>\n</tr></thead>\n<tbody>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Flare AD on PD1</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">No</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">32 (62%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Yes</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">20 (38%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Time to flare, median (range), d</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">38 (8–161)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Grade of flare</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">G1-2</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">17 (33%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">G3</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">3 (6%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">G4</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">0 (0%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Flare by AD subtype</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Rheumatologic</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">14 of 27 (52%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">7/13 RA, 3/3 PMR, 1/2 scleroderma, 2/2 Sjogren's, 1/2 psoriatic arthritis</td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Dermatologic</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">3 of 8 (38%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">3/6 psoriasis</td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Gastrointestinal</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">0 of 6 (0%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Neurologic</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">0 of 5 (0%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Endocrine</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">1 of 4 (25%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">1/4 Graves</td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Respiratory</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">0 of 2 (0%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Hematologic</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">2 of 2 (100%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">2/2 ITP</td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Flare by AD stability at start of PD1</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Clinically active</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">9 of 15 (60%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Clinically inactive</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">11 of 37 (30%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">On immunosuppression</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">10 of 20 (50%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Not on immunosuppression</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">10 of 32 (31%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Immunosuppression required for AD flare</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">oral steroids</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">11 (21%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">SSA</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">6 (12%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Steroids and SSA</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">2 (4%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">IVIG</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">1 (2%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">PD1 dosing with AD flare</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Continue</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">10 (20%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Interrupt</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">8 (15%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">permanently discontinue</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">2 (4%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Conventional irAE</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">No</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">37 (71%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Yes</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">15 (29%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">G1-2</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">10 (20%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">G3</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">5 (10%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">2 hepatitis, 1 colitis, pancreatitis and pneumonitis</td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Immunosuppression required for irAE</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Symptomatic management</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">8 (15%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Oral steroids</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">4 (8%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">IV steroids</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">2 (4%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Steroids and SSA</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">1 (2%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">PD1 dosing with irAE</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Continue</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">8 (15%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Interrupt</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">3 (6%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Permanently discontinue</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">4 (8%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n</tbody>\n</table></div>\n<div class=\"p text-right font-secondary\"><a href=\"table/t0015/\" class=\"usa-link\" target=\"_blank\" rel=\"noopener noreferrer\">Open in a new tab</a></div>\n<div class=\"tw-foot p\"><div class=\"fn\" id=\"fn5\"><p>AD, autoimmune disorder; PD1, anti-PD-1 antibody; irAE, immune-related adverse event; SSA, steroid-sparing agent; IVIG, intravenous immunoglobulin.</p></div></div></section>"
      },
      {
        "id": "CE-9639addb9669af500508f990-span-fde6ff5ca95cce2f48f851dd",
        "source_id": "report-4dc8065ee250c21dff2cc0e3:main-html:64a4777492f351ce",
        "block_id": "b00019",
        "supporting_quote": "<section class=\"tw xbox font-sm\" id=\"t0010\"><h4 class=\"obj_head\">Table 1.</h4>\n<div class=\"caption p\"><p>Characteristics of patients with autoimmune disorders</p></div>\n<div class=\"tbl-box p\" tabindex=\"0\"><table class=\"content\" frame=\"hsides\" rules=\"groups\">\n<thead><tr>\n<th align=\"left\" colspan=\"1\" rowspan=\"1\"></th>\n<th align=\"left\" colspan=\"1\" rowspan=\"1\">Number (%) (<em>N</em>=52)</th>\n<th align=\"left\" colspan=\"1\" rowspan=\"1\">Details</th>\n</tr></thead>\n<tbody>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Demographics and disease characteristics</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Age, median (range), y</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">71 (23–88)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Males</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">31 (60%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">AJCC stage M1c</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">44 (85%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Brain metastases</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">16 (31%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Elevated serum LDH</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">25 (48%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">ECOG≥1</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">29 (56%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Prior ipilimumab treatment</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">28 (54%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">No prior systemic therapy</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">23 (44%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">AI disorder<a href=\"#tf0010\" class=\"usa-link\"><sup>a</sup></a>\n</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Rheumatologic</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">27 (52%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">RA 13, sarcoidosis 3, PMR 3, SLE 2, scleroderma 2, psoriatic arthritis 2, Sjogren's 2</td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Dermatologic</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">8 (15%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">psoriasis 6, eczema, erythema nodosum</td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Gastrointestinal</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">6 (12%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">CD 3, UC with colectomy 2, celiac disease 1</td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Neurologic</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">5 (10%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">GBS 2, CIDP 1, MG 1, Bell's palsy 1</td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Endocrine</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">4 (8%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Graves’ disease 4</td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Respiratory</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">2 (4%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Asthma 2 (1 severe on long-term oral steroids)</td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Hematologic</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">2 (4%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">ITP 2</td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Activity of AI disorder at PD1 start</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Not clinically active</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">37 (71%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Clinically active</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">15 (29%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">11 rheumatologic (RA 5, psoriatic arthritis 2, Sjogrens 2, sarcoidosis 1, PMR 1), 3 psoriasis, 1 severe asthma</td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Treatment of AI disorder at PD1 start</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">No immunosuppresion</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">32 (62%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Corticosteroids</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">9 (17%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Steroid-sparing agent</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">5 (10%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Mesalamine 2, leflunomide, hydroxychloroquine, apremilast</td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Steroids and SSAs</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">5 (10%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">Sulfasalazine, leflunomide, hydroxychloroquine, methotrexate, ibuprofen</td>\n</tr>\n<tr>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">IVIG</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\">1 (2%)</td>\n<td align=\"left\" colspan=\"1\" rowspan=\"1\"></td>\n</tr>\n</tbody>\n</table></div>\n<div class=\"p text-right font-secondary\"><a href=\"table/t0010/\" class=\"usa-link\" target=\"_blank\" rel=\"noopener noreferrer\">Open in a new tab</a></div>\n<div class=\"tw-foot p\">\n<div class=\"fn\" id=\"sp0020\"><p>Data are given as number (percentage) unless otherwise specified.</p></div>\n<div class=\"fn\" id=\"sp0025\"><p>RA, rheumatoid arthritis; PMR, polymyalgia rheumatica; SLE, systemic lupus erythematosus; CD, Crohn’s disease; UC, ulcerative colitis; GBS, Guillain-Barre syndrome; CIDP, chronic inflammatory demyelinating polyneuropathy; MG, myasthenia gravis; ITP, immune thrombocytopenia purpura; SSA, steroid-sparing agent.</p></div>\n<div class=\"fn\" id=\"tf0010\">\n<sup>a</sup><p class=\"display-inline\" id=\"np0010\">Total exceeds 52 because 2 patients had 2 disorders.</p>\n</div>\n</div></section>"
      }
    ],
    "reason": "The count8 belongs to the dermatologic category, consisting of psoriasis6 plus eczema and erythema nodosum. Prefer inclusive dermatologic label; do not assert all8 have psoriasis."
  },
  {
    "id": "reviewed-28056206:1:5",
    "pmid": "28056206",
    "samples": [
      "86"
    ],
    "contexts": [
      {
        "stage": "R2",
        "source": "2ebf550598299141e569f6e4797f2730554300303a123bd2a049efe0b107b24e",
        "binding": "1462eeb7f22252601ea6b0059ac111b964dcff0df11fde70a00ed6a72d82ac40",
        "population": "p_mucosal",
        "comparator": null,
        "intervention": "a_nivolumab"
      },
      {
        "stage": "R3",
        "source": "c38f62403a888da7b3747978ee7568428d092c2d5e299cbc7c9b4f3ecb095c05",
        "binding": "da3e798bf980be8fa7c6ad1317d9b8045b92e07609e6d8114850c01ef48d88ad",
        "population": "p_nivolumab_mucosal",
        "comparator": null,
        "intervention": "a_nivolumab"
      }
    ],
    "preferred_context": 1,
    "evidence": [
      {
        "id": "CE-da3e798bf980be8fa7c6ad13-span-d647b263cc37ea6c2870b2a9",
        "source_id": "report-0d425e2a9a761b3544580c98:main-html:67fb9922cb05d0d6",
        "block_id": "b00019",
        "supporting_quote": "Among 889 patients who received nivolumab monotherapy, 86 (10%) with mucosal melanoma and 665 (75%) with cutaneous melanoma were included in the analyses. For those who received nivolumab combined with ipilimumab (n = 407), 35 patients (9%) with mucosal melanoma and 326 (80%) with cutaneous melanoma were included; 36 of 357 patients (10%) with mucosal melanoma and 269 (75%) with cutaneous melanoma had received ipilimumab monotherapy. The remaining 11% to 15% of patients within each pooled group were diagnosed with acral melanoma, uveal melanoma, or unknown primaries."
      }
    ],
    "reason": "Source explicitly gives nivolumab mucosal86/cutaneous665 and combination mucosal35/cutaneous326. Match within regimen and melanoma subtype, not across them."
  },
  {
    "id": "reviewed-28056206:2:6",
    "pmid": "28056206",
    "samples": [
      "665"
    ],
    "contexts": [
      {
        "stage": "R2",
        "source": "2ebf550598299141e569f6e4797f2730554300303a123bd2a049efe0b107b24e",
        "binding": "1462eeb7f22252601ea6b0059ac111b964dcff0df11fde70a00ed6a72d82ac40",
        "population": "p_cutaneous",
        "comparator": null,
        "intervention": "a_nivolumab"
      },
      {
        "stage": "R3",
        "source": "c38f62403a888da7b3747978ee7568428d092c2d5e299cbc7c9b4f3ecb095c05",
        "binding": "da3e798bf980be8fa7c6ad1317d9b8045b92e07609e6d8114850c01ef48d88ad",
        "population": "p_nivolumab_cutaneous",
        "comparator": null,
        "intervention": "a_nivolumab"
      }
    ],
    "preferred_context": 1,
    "evidence": [
      {
        "id": "CE-da3e798bf980be8fa7c6ad13-span-d647b263cc37ea6c2870b2a9",
        "source_id": "report-0d425e2a9a761b3544580c98:main-html:67fb9922cb05d0d6",
        "block_id": "b00019",
        "supporting_quote": "Among 889 patients who received nivolumab monotherapy, 86 (10%) with mucosal melanoma and 665 (75%) with cutaneous melanoma were included in the analyses. For those who received nivolumab combined with ipilimumab (n = 407), 35 patients (9%) with mucosal melanoma and 326 (80%) with cutaneous melanoma were included; 36 of 357 patients (10%) with mucosal melanoma and 269 (75%) with cutaneous melanoma had received ipilimumab monotherapy. The remaining 11% to 15% of patients within each pooled group were diagnosed with acral melanoma, uveal melanoma, or unknown primaries."
      }
    ],
    "reason": "Source explicitly gives nivolumab mucosal86/cutaneous665 and combination mucosal35/cutaneous326. Match within regimen and melanoma subtype, not across them."
  },
  {
    "id": "reviewed-28056206:3:7",
    "pmid": "28056206",
    "samples": [
      "35"
    ],
    "contexts": [
      {
        "stage": "R2",
        "source": "2ebf550598299141e569f6e4797f2730554300303a123bd2a049efe0b107b24e",
        "binding": "1462eeb7f22252601ea6b0059ac111b964dcff0df11fde70a00ed6a72d82ac40",
        "population": "p_mucosal",
        "comparator": null,
        "intervention": "a_nivolumab_ipilimumab"
      },
      {
        "stage": "R3",
        "source": "c38f62403a888da7b3747978ee7568428d092c2d5e299cbc7c9b4f3ecb095c05",
        "binding": "da3e798bf980be8fa7c6ad1317d9b8045b92e07609e6d8114850c01ef48d88ad",
        "population": "p_combo_mucosal",
        "comparator": null,
        "intervention": "a_nivolumab_ipilimumab"
      }
    ],
    "preferred_context": 1,
    "evidence": [
      {
        "id": "CE-da3e798bf980be8fa7c6ad13-span-d647b263cc37ea6c2870b2a9",
        "source_id": "report-0d425e2a9a761b3544580c98:main-html:67fb9922cb05d0d6",
        "block_id": "b00019",
        "supporting_quote": "Among 889 patients who received nivolumab monotherapy, 86 (10%) with mucosal melanoma and 665 (75%) with cutaneous melanoma were included in the analyses. For those who received nivolumab combined with ipilimumab (n = 407), 35 patients (9%) with mucosal melanoma and 326 (80%) with cutaneous melanoma were included; 36 of 357 patients (10%) with mucosal melanoma and 269 (75%) with cutaneous melanoma had received ipilimumab monotherapy. The remaining 11% to 15% of patients within each pooled group were diagnosed with acral melanoma, uveal melanoma, or unknown primaries."
      }
    ],
    "reason": "Source explicitly gives nivolumab mucosal86/cutaneous665 and combination mucosal35/cutaneous326. Match within regimen and melanoma subtype, not across them.",
    "treatment_preferences": {
      "intervention": {
        "context": 1,
        "reason": "The pooled combination protocol explicitly allowed nivolumab maintenance after nivolumab plus ipilimumab. Preserve the raw schedule qualifier that maintenance was optional; this is the same subtype-specific combination cohort.",
        "evidence": [
          {
            "id": "CE-da3e798bf980be8fa7c6ad13-span-d5c721c8a8cf7e5716ceee03",
            "source_id": "report-0d425e2a9a761b3544580c98:main-html:67fb9922cb05d0d6",
            "block_id": "b00013",
            "supporting_quote": "To evaluate the efficacy and safety of nivolumab combined with ipilimumab in mucosal melanoma, data were pooled from CheckMate 067 and an ongoing phase II trial (CheckMate 069) of nivolumab plus ipilimumab versus ipilimumab alone in treatment-naïve patients. 5 Across melanoma subtypes, 407 patients (313 from CheckMate 067; 94 from CheckMate 069) had received nivolumab (1 mg/kg) plus ipilimumab (3 mg/kg) every 3 weeks for up to four doses, and after combination therapy, patients could have received nivolumab monotherapy at 3 mg/kg every 2 weeks until progression or unacceptable toxicity; 357 patients had received ipilimumab monotherapy (3 mg/kg every 3 weeks for four doses)."
          },
          {
            "id": "CE-da3e798bf980be8fa7c6ad13-span-d647b263cc37ea6c2870b2a9",
            "source_id": "report-0d425e2a9a761b3544580c98:main-html:67fb9922cb05d0d6",
            "block_id": "b00019",
            "supporting_quote": "Among 889 patients who received nivolumab monotherapy, 86 (10%) with mucosal melanoma and 665 (75%) with cutaneous melanoma were included in the analyses. For those who received nivolumab combined with ipilimumab (n = 407), 35 patients (9%) with mucosal melanoma and 326 (80%) with cutaneous melanoma were included; 36 of 357 patients (10%) with mucosal melanoma and 269 (75%) with cutaneous melanoma had received ipilimumab monotherapy. The remaining 11% to 15% of patients within each pooled group were diagnosed with acral melanoma, uveal melanoma, or unknown primaries."
          }
        ]
      }
    }
  },
  {
    "id": "reviewed-28056206:4:8",
    "pmid": "28056206",
    "samples": [
      "326"
    ],
    "contexts": [
      {
        "stage": "R2",
        "source": "2ebf550598299141e569f6e4797f2730554300303a123bd2a049efe0b107b24e",
        "binding": "1462eeb7f22252601ea6b0059ac111b964dcff0df11fde70a00ed6a72d82ac40",
        "population": "p_cutaneous",
        "comparator": null,
        "intervention": "a_nivolumab_ipilimumab"
      },
      {
        "stage": "R3",
        "source": "c38f62403a888da7b3747978ee7568428d092c2d5e299cbc7c9b4f3ecb095c05",
        "binding": "da3e798bf980be8fa7c6ad1317d9b8045b92e07609e6d8114850c01ef48d88ad",
        "population": "p_combo_cutaneous",
        "comparator": null,
        "intervention": "a_nivolumab_ipilimumab"
      }
    ],
    "preferred_context": 1,
    "evidence": [
      {
        "id": "CE-da3e798bf980be8fa7c6ad13-span-d647b263cc37ea6c2870b2a9",
        "source_id": "report-0d425e2a9a761b3544580c98:main-html:67fb9922cb05d0d6",
        "block_id": "b00019",
        "supporting_quote": "Among 889 patients who received nivolumab monotherapy, 86 (10%) with mucosal melanoma and 665 (75%) with cutaneous melanoma were included in the analyses. For those who received nivolumab combined with ipilimumab (n = 407), 35 patients (9%) with mucosal melanoma and 326 (80%) with cutaneous melanoma were included; 36 of 357 patients (10%) with mucosal melanoma and 269 (75%) with cutaneous melanoma had received ipilimumab monotherapy. The remaining 11% to 15% of patients within each pooled group were diagnosed with acral melanoma, uveal melanoma, or unknown primaries."
      }
    ],
    "reason": "Source explicitly gives nivolumab mucosal86/cutaneous665 and combination mucosal35/cutaneous326. Match within regimen and melanoma subtype, not across them.",
    "treatment_preferences": {
      "intervention": {
        "context": 1,
        "reason": "The pooled combination protocol explicitly allowed nivolumab maintenance after nivolumab plus ipilimumab. Preserve the raw schedule qualifier that maintenance was optional; this is the same subtype-specific combination cohort.",
        "evidence": [
          {
            "id": "CE-da3e798bf980be8fa7c6ad13-span-d5c721c8a8cf7e5716ceee03",
            "source_id": "report-0d425e2a9a761b3544580c98:main-html:67fb9922cb05d0d6",
            "block_id": "b00013",
            "supporting_quote": "To evaluate the efficacy and safety of nivolumab combined with ipilimumab in mucosal melanoma, data were pooled from CheckMate 067 and an ongoing phase II trial (CheckMate 069) of nivolumab plus ipilimumab versus ipilimumab alone in treatment-naïve patients. 5 Across melanoma subtypes, 407 patients (313 from CheckMate 067; 94 from CheckMate 069) had received nivolumab (1 mg/kg) plus ipilimumab (3 mg/kg) every 3 weeks for up to four doses, and after combination therapy, patients could have received nivolumab monotherapy at 3 mg/kg every 2 weeks until progression or unacceptable toxicity; 357 patients had received ipilimumab monotherapy (3 mg/kg every 3 weeks for four doses)."
          },
          {
            "id": "CE-da3e798bf980be8fa7c6ad13-span-d647b263cc37ea6c2870b2a9",
            "source_id": "report-0d425e2a9a761b3544580c98:main-html:67fb9922cb05d0d6",
            "block_id": "b00019",
            "supporting_quote": "Among 889 patients who received nivolumab monotherapy, 86 (10%) with mucosal melanoma and 665 (75%) with cutaneous melanoma were included in the analyses. For those who received nivolumab combined with ipilimumab (n = 407), 35 patients (9%) with mucosal melanoma and 326 (80%) with cutaneous melanoma were included; 36 of 357 patients (10%) with mucosal melanoma and 269 (75%) with cutaneous melanoma had received ipilimumab monotherapy. The remaining 11% to 15% of patients within each pooled group were diagnosed with acral melanoma, uveal melanoma, or unknown primaries."
          }
        ]
      }
    }
  },
  {
    "id": "reviewed-28283736:2:5",
    "pmid": "28283736",
    "samples": [
      "8"
    ],
    "contexts": [
      {
        "stage": "R2",
        "source": "a2ae2fc304cae244eb08baab833521dabf38b135979d20458133a75f91810f09",
        "binding": "97204ec00a14007403bb2fb5c4debfc6ccba35c9715a6ff909123cb497378907",
        "population": "p3",
        "comparator": null,
        "intervention": "a1"
      },
      {
        "stage": "R3",
        "source": "46374582b30b52751a1c8a9a8173b3eea638a561e9219d52f5c51bdde96f24f4",
        "binding": "0dbc4f9d77134c26c6ac699f9c67196c286e2208898e0465da75a6802a301afe",
        "population": "p6",
        "comparator": null,
        "intervention": "a1"
      }
    ],
    "preferred_context": 1,
    "evidence": [
      {
        "id": "CE-0dbc4f9d77134c26c6ac699f-span-19a4e4a2ce4766fe86dfa8cc",
        "source_id": "report-b6eb396e82cccc8a0be90003:main:25341e9a7d30a8d1",
        "block_id": "b00026",
        "supporting_quote": "Among the 42 enrolled patients, 37 were evaluable for the tumor response performed by central review. Five patients without measurable lesions at baseline according to central review were excluded from the analysis. Of the 37 patients, 29 had cutaneous melanoma (primary efficacy evaluation population) and 8 had mucosal melanoma. The tumor response results per RECIST v1.1 are summarized in Table 3 and Fig. 1 . A waterfall plot shows that 75.7% (28/37) of the patients experienced some degree of tumor shrinkage. The confirmed ORR, as assessed by central review, was 24.1% for the patients with cutaneous melanoma (7/29; 95% CI 10.3–43.5), and the lower limit of the 95% CI exceeded the 10% threshold response rate ( P = 0.0216). The median time to response was 12.3 weeks among the patients with cutaneous melanoma. The responses were durable, and the median DOR was not reached; 5 (71.4%) of the 7 responders with cutaneous melanoma remained progression-free. The confirmed ORR, as assessed by central review, was 25.0% for the patients with mucosal melanoma (2/8; 95% CI 3.2–65.1). The median time to response was 17.8 weeks among the patients with mucosal melanoma. The median DOR was not reached, and 2 (100%) of the 2 responders with mucosal melanoma remained progression-free. Similar tumor response results were obtained by investigator review (Table 3 ). Kaplan–Meier curves of PFS per RECIST v1.1 by central review and OS are shown in Fig. 2 . The median PFS as assessed by central review was 4.2 months (95% CI 2.8–7.0) for the patients with cutaneous melanoma, with a 6-month PFS rate of 41.4%. The median PFS was 3.4 months (95% CI 2.1–NA) for the patients with mucosal melanoma, with a 6-month PFS rate of 37.5%. The median OS was not reached in either population, with a 12-month OS rate of 82.7% for the patients with cutaneous melanoma and 51.4% for the patients with mucosal melanoma."
      },
      {
        "id": "CE-0dbc4f9d77134c26c6ac699f-span-421e3329ddb915d4083a9780",
        "source_id": "report-b6eb396e82cccc8a0be90003:main:25341e9a7d30a8d1",
        "block_id": "b00027",
        "supporting_quote": "Table 3 Tumor response in patients with advanced melanoma treated with pembrolizumab Cutaneous melanoma n (%; 95% CI) Mucosal melanoma n (%; 95% CI) Total n (%; 95% CI) Central review ( n = 29) ( n = 8) ( n = 37) Overall response 7 (24.1%, 10.3–43.5) 2 (25.0%, 3.2–65.1) 9 (24.3%, 11.8–41.2) Complete response 2 (6.9%, 0.8–22.8) 0 2 (5.4%, 0.7–18.2) Partial response 5 (17.2%, 5.8–35.8) 2 (25.0%, 3.2–65.1) 7 (18.9%, 8.0–35.2) Stable disease 7 (24.1%, 10.3–43.5) 2 (25.0%, 3.2–65.1) 9 (24.3%, 11.8–41.2) Progressive disease 14 (48.3%, 29.4–67.5) 4 (50.0%, 15.7–84.3) 18 (48.6%, 31.9–65.6) Non-evaluable 1 (3.4%, 0.1–17.8) 0 1(2.7%, 0.1–14.2) Investigator review ( n = 34) ( n = 8) ( n = 42) Overall response 9 (26.5%, 12.9–44.4) 3 (37.5%, 8.5–75.5) 12 (28.6%, 15.7–44.6) Complete response 2 (5.9%, 0.7–19.7) 0 2 (4.8%, 0.6–16.2) Partial response 7 (20.6%, 8.7–37.9) 3 (37.5%, 8.5–75.5) 10 (23.8%, 12.1–39.5) Stable disease 14 (41.2%, 24.6–59.3) 2 (25.0%, 3.2–65.1) 16 (38.1%, 23.6–54.4) Progressive disease 11 (32.4%, 17.4–50.5) 3 (37.5%, 8.5–75.5) 14 (33.3%, 19.6–49.5) Median time to response, weeks (range) 12.3 (12–18) 17.8 (12–24) 12.3 (12–24) Median duration of response, weeks (range) NR (17 to 37+) NR (24+ to 36+) NR (17 to 37+) NR not reached"
      }
    ],
    "reason": "All eight mucosal patients were centrally response-evaluable; same cohort, while investigator and central outcomes remain separately labeled."
  },
  {
    "id": "reviewed-25846669:1:2",
    "pmid": "25846669",
    "samples": [
      "13"
    ],
    "contexts": [
      {
        "stage": "R2",
        "source": "86c29d01cc04139b2e7b9655262d7e64a1e25f75f4eff5555e0cdc2b83f0a574",
        "binding": "fadfd44e4df765ecfd784e2e7ff4b74295aaebbc1e291192139bd3e6a1096227",
        "population": "p1",
        "comparator": null,
        "intervention": "a1"
      },
      {
        "stage": "R3",
        "source": "b6ed41a40f4a2dbf2def6dc773f6e3254762f6efe56ccef0e954afca584cbdbe",
        "binding": "f5e329bcd57aa630569ab9db4a3031494dc8606a65df164f52203d6294a43181",
        "population": "p2",
        "comparator": null,
        "intervention": "a1"
      }
    ],
    "preferred_context": 1,
    "evidence": [
      {
        "id": "CE-f5e329bcd57aa630569ab9db-span-0f97484be262aaaf2f6545f0",
        "source_id": "report-584c14821db4dbf6f7b2155f:main-html:6475f70efacae5f3",
        "block_id": "b00033",
        "supporting_quote": "Eighteen patients (seven women and 11 men), with an average age of 54 years, were included. At study inclusion, eight patients had AJCC stage III disease and ten had AJCC stage IV disease. Before their inclusion, 13 patients had previously been treated with at least one line of chemotherapy or immunotherapy. Five patients were excluded from data analysis: two because of insufficient tumor material for TIL production and three because they did not receive TIL infusions due to rapid disease progression with appearance of brain metastasis and development of major asthenia and anorexia. Finally, 13 patients whose characteristics are summarized in Table 1 were clinically assessed."
      },
      {
        "id": "CE-f5e329bcd57aa630569ab9db-span-3dd00c0ee190d70f00b6dd0a",
        "source_id": "report-584c14821db4dbf6f7b2155f:main-html:6475f70efacae5f3",
        "block_id": "b00036",
        "supporting_quote": "TIL could be produced for 16 out of the 18 patients included but only 13 patients received autologous TILs. Eleven patients received two TIL infusions and two patients received only the first cycle of TIL due to disease progression before protocol completion. All patients received between 1.66 × 10 9 and 22.2 × 10 9 TILs and between two and 16 cycles of IFN-γ injections. Autologous melanoma cell lines were obtained for eight patients allowing determining the proportion of specific reactive T cells producing IFN-γ (Table 2 ) which varied from 0.006 × 10 9 to 0.43 × 10 9 T lymphocytes."
      }
    ],
    "reason": "Same13 patients received TIL and were clinically assessed after five of18 enrolled were excluded; R3 provides complete regimen detail.",
    "treatment_preferences": {
      "intervention": {
        "context": 1,
        "reason": "Full text explicitly gives TIL followed by IL2, together with intratumoral TG1042, and defines TG1042 as adenovirus expressing IFN-gamma. This completes the same13-person treatment regimen.",
        "evidence": [
          {
            "id": "CE-f5e329bcd57aa630569ab9db-span-1ef289ba9ca17cf25605dffc",
            "source_id": "report-584c14821db4dbf6f7b2155f:main-html:6475f70efacae5f3",
            "block_id": "b00011",
            "supporting_quote": "TG1042 consists of a suspension of recombinant type 5 adenoviral particles, carrying the gene coding for human IFN-γ. As it is a live virus expressing a transgene, it is considered as a genetically modified organism and has been classified from a regulatory standpoint at the biosafety level 2. An agreement to handle the virus in the different areas involved including pharmacy and clinical ward is needed for each center. Preparation was performed under a class II safety cabinet. TG1042 was supplied frozen at −80 °C in single-dose ampoules (Transgene SA, Illkirch, France), and it was thawed before use and injected by the physician into lesions selected for intratumoral injection."
          },
          {
            "id": "CE-f5e329bcd57aa630569ab9db-span-3dd00c0ee190d70f00b6dd0a",
            "source_id": "report-584c14821db4dbf6f7b2155f:main-html:6475f70efacae5f3",
            "block_id": "b00036",
            "supporting_quote": "TIL could be produced for 16 out of the 18 patients included but only 13 patients received autologous TILs. Eleven patients received two TIL infusions and two patients received only the first cycle of TIL due to disease progression before protocol completion. All patients received between 1.66 × 10 9 and 22.2 × 10 9 TILs and between two and 16 cycles of IFN-γ injections. Autologous melanoma cell lines were obtained for eight patients allowing determining the proportion of specific reactive T cells producing IFN-γ (Table 2 ) which varied from 0.006 × 10 9 to 0.43 × 10 9 T lymphocytes."
          },
          {
            "id": "CE-f5e329bcd57aa630569ab9db-span-5fb52094319ca123448e12fb",
            "source_id": "report-584c14821db4dbf6f7b2155f:main-html:6475f70efacae5f3",
            "block_id": "b00013",
            "supporting_quote": "The sequences of TIL/IL-2 injections and TG1042 administration are shown in Fig. 1 . All injections were performed at the investigational site (Department of Dermato-Oncology, Nantes). TILs were infused over a 30- to 60-min period on days 1 and 29 followed by subcutaneous IL-2 injections (6 M IU daily) for 10 days (Proleukine, Novartis Pharma SAS, France). TG1042 was injected into the tumor at a dose of 5 × 10 10 viral particles per lesion (into up to six lesions) every 2 weeks from day −15 to month 2 and then every month up to month 11 or progression."
          }
        ]
      }
    }
  },
  {
    "id": "reviewed-22658128:1:2",
    "pmid": "22658128",
    "samples": [
      "52"
    ],
    "contexts": [
      {
        "stage": "R2",
        "source": "bc5ea5ee4f5646c51965c4b214bff9849df6158a6184efe8e38260f3a61a88cc",
        "binding": "79b49b0ab5156a54d0ad13cb8fe8c9fdff471c7c70e5ab4a25e5ce963a6af9e4",
        "population": "p2",
        "comparator": null,
        "intervention": "a1"
      },
      {
        "stage": "R3",
        "source": "b35ffae974db76f6d9045e62d7f9da5ead1990fb10ca7e8dbb4890b6b5729a2e",
        "binding": "cc52b2a528abc53d5fc8ccd639f1a2c53f0b71df6ab46bcc8d812c4a8db9da73",
        "population": "p4",
        "comparator": null,
        "intervention": "a2"
      }
    ],
    "preferred_context": 1,
    "evidence": [
      {
        "id": "CE-cc52b2a528abc53d5fc8ccd6-span-4100d3cc6e7f6bcc43b05bba",
        "source_id": "report-4f9b485c95614caef8bd8f46:main:bb6416bacb0059c1",
        "block_id": "b00025",
        "supporting_quote": "We evaluated baseline characteristics and adverse events in all 207 patients who were receiving anti–PD-L1 antibody as of February 24, 2012. The efficacy population consisted of 160 patients in whom a response could be evaluated and who had initiated treatment by August 1, 2011. All adverse events were coded with the use of the Medical Dictionary for Regulatory Activities , version 14.1. We derived the best overall response for individual patients from radiographic measurements according to modified RECIST, version 1.0. 24 Objective responses were confirmed by at least one sequential tumor assessment. (Additional details regarding statistical methods are provided in Methods S1 and the statistical analysis plan in the Supplementary Appendix .)"
      },
      {
        "id": "CE-cc52b2a528abc53d5fc8ccd6-span-726adfebe033a5e7fe2cc8fb",
        "source_id": "report-4f9b485c95614caef8bd8f46:main:bb6416bacb0059c1",
        "block_id": "b00038",
        "supporting_quote": "In patients with melanoma, there were nine objective responses among 52 patients receiving 1-mg, 3-mg, and 10-mg per kilogram doses, with response rates of 6%, 29%, and 19%, respectively ( Table 2 ). Three patients with melanoma achieved a complete response. All 9 patients who had a response started treatment at least 1 year before data analysis, and of these patients, 5 had an objective response lasting at least 1 year. In addition, 14 of 52 patients with melanoma (27%) had stable disease lasting at least 24 weeks."
      }
    ],
    "reason": "Same52 response-evaluable melanoma patients receiving1,3 or10mg/kg anti-PD-L1; retain drug/class refinement only with named-drug evidence.",
    "treatment_preferences": {
      "intervention": {
        "context": 1,
        "reason": "The study explicitly identifies its PD-L1-specific antibody as BMS-936559 and the same52-person melanoma efficacy cohort received1,3 or10mg/kg.",
        "evidence": [
          {
            "id": "CE-cc52b2a528abc53d5fc8ccd6-span-50a30d8d873a64df76ba5289",
            "source_id": "report-4f9b485c95614caef8bd8f46:main:bb6416bacb0059c1",
            "block_id": "b00006",
            "supporting_quote": "BMS-936559 is a high-affinity, fully human, PD-L1–specific, IgG4 (S228P) monoclonal antibody that inhibits the binding of PD-L1 to both PD-1 and CD80. Additional characterization of this anti–PD-L1 antibody is presented in the study protocol, available with the full text of this article at NEJM.org. In this report, we present clinical evidence regarding the safety, clinical activity, and pharmacokinetic and pharmacodynamic effects of anti–PD-L1 antibody in patients with selected advanced cancers."
          },
          {
            "id": "CE-cc52b2a528abc53d5fc8ccd6-span-726adfebe033a5e7fe2cc8fb",
            "source_id": "report-4f9b485c95614caef8bd8f46:main:bb6416bacb0059c1",
            "block_id": "b00038",
            "supporting_quote": "In patients with melanoma, there were nine objective responses among 52 patients receiving 1-mg, 3-mg, and 10-mg per kilogram doses, with response rates of 6%, 29%, and 19%, respectively ( Table 2 ). Three patients with melanoma achieved a complete response. All 9 patients who had a response started treatment at least 1 year before data analysis, and of these patients, 5 had an objective response lasting at least 1 year. In addition, 14 of 52 patients with melanoma (27%) had stable disease lasting at least 24 weeks."
          }
        ]
      }
    }
  },
  {
    "id": "reviewed-20668005:1:3",
    "pmid": "20668005",
    "samples": [
      "33"
    ],
    "contexts": [
      {
        "stage": "R2",
        "source": "5ceb2b75e14f312f7effbcd35bb8e18cbbccbf545722d517cbac6627c0e16e59",
        "binding": "0db5b3432c477b982e7495db6eab6f72cf760bc22383096696dd3cad7b8e8545",
        "population": "pop-treated",
        "comparator": null,
        "intervention": "arm-nma"
      },
      {
        "stage": "R3",
        "source": "a1dcac2ee413ebc6166acdb1ae981223fe8d6f59435221db1c9281c81d10f944",
        "binding": "bec230153586be60e10ce9b3a1408dbe23ca8c5e00819927e9dc111b0b05471e",
        "population": "pop-nma-r3",
        "comparator": null,
        "intervention": "arm-nma-r3"
      }
    ],
    "preferred_context": 1,
    "evidence": [
      {
        "id": "CE-bec230153586be60e10ce9b3-span-8965348d65867c94bee344e6",
        "source_id": "report-e4838866b6b3e4ac6b64d41d:main:8d9a0558b3e5ed09",
        "block_id": "b00011",
        "supporting_quote": "One group of 33 patients received non-myeloablative chemotherapy (NMA) consisting of 60mg/kg/day cyclophosphamide for two days followed by five days of 25mg/m 2 /day fludarabine. A second cohort of 23 patients received two days of 60mg/kg cyclophosphamide overlapping the first two of five days of 25mg/m 2 /day fludarabine. On the final day of fludarabine, patients received two fractions of 2Gy TBI separated by at least 6hr, and the following day they received one fraction of 2Gy TBI. On the day following chemotherapy or radiation all patients received a bolus intravenous infusion of CD8+ enriched young TIL and started high dose IL-2 therapy (720,000IU/kg intravenously every 8hr to tolerance). One day after TIL infusion, patients who received 6Gy TBI received a minimum of 2 × 10 6 /kg autologous purified (Miltenyi) CD34+ hematopoietic stem cells from a G-CSF±plerixafor mobilized pheresis."
      },
      {
        "id": "CE-bec230153586be60e10ce9b3-span-dad4b27de30b7c2a514b65fe",
        "source_id": "report-e4838866b6b3e4ac6b64d41d:main:8d9a0558b3e5ed09",
        "block_id": "b00019",
        "supporting_quote": "The safety and efficacy of therapy using CD8+ enriched young TIL following lymphodepletion was investigated in two cohorts of patients with metastatic melanoma. Thirty-three patients received CD8+ enriched TIL with NMA, and 23 patients received CD8+ enriched young TIL following NMA plus 6Gy of total body irradiation (TBI). The demographic characteristics of these patients and the treatments administered are shown in Table 1 . 64% of patients had received prior IL-2. Median follow up as of April 1, 2010 in the NMA and 6Gy TBI cohorts was 14 months and 7 months, respectively."
      }
    ],
    "reason": "Same two treatment cohorts: NMA33 and NMA+6GyTBI23; full text resolves conditioning components and the TBI-arm stem-cell support. Do not merge the two cohorts.",
    "treatment_preferences": {
      "intervention": {
        "context": 1,
        "reason": "The NMA conditioning in the33-person cohort explicitly consisted of cyclophosphamide followed by fludarabine, then TIL and high-dose IL2. R3 resolves the original conditioning class without changing the cohort.",
        "evidence": [
          {
            "id": "CE-bec230153586be60e10ce9b3-span-8965348d65867c94bee344e6",
            "source_id": "report-e4838866b6b3e4ac6b64d41d:main:8d9a0558b3e5ed09",
            "block_id": "b00011",
            "supporting_quote": "One group of 33 patients received non-myeloablative chemotherapy (NMA) consisting of 60mg/kg/day cyclophosphamide for two days followed by five days of 25mg/m 2 /day fludarabine. A second cohort of 23 patients received two days of 60mg/kg cyclophosphamide overlapping the first two of five days of 25mg/m 2 /day fludarabine. On the final day of fludarabine, patients received two fractions of 2Gy TBI separated by at least 6hr, and the following day they received one fraction of 2Gy TBI. On the day following chemotherapy or radiation all patients received a bolus intravenous infusion of CD8+ enriched young TIL and started high dose IL-2 therapy (720,000IU/kg intravenously every 8hr to tolerance). One day after TIL infusion, patients who received 6Gy TBI received a minimum of 2 × 10 6 /kg autologous purified (Miltenyi) CD34+ hematopoietic stem cells from a G-CSF±plerixafor mobilized pheresis."
          },
          {
            "id": "CE-bec230153586be60e10ce9b3-span-dad4b27de30b7c2a514b65fe",
            "source_id": "report-e4838866b6b3e4ac6b64d41d:main:8d9a0558b3e5ed09",
            "block_id": "b00019",
            "supporting_quote": "The safety and efficacy of therapy using CD8+ enriched young TIL following lymphodepletion was investigated in two cohorts of patients with metastatic melanoma. Thirty-three patients received CD8+ enriched TIL with NMA, and 23 patients received CD8+ enriched young TIL following NMA plus 6Gy of total body irradiation (TBI). The demographic characteristics of these patients and the treatments administered are shown in Table 1 . 64% of patients had received prior IL-2. Median follow up as of April 1, 2010 in the NMA and 6Gy TBI cohorts was 14 months and 7 months, respectively."
          }
        ]
      }
    }
  },
  {
    "id": "reviewed-20668005:2:4",
    "pmid": "20668005",
    "samples": [
      "23"
    ],
    "contexts": [
      {
        "stage": "R2",
        "source": "5ceb2b75e14f312f7effbcd35bb8e18cbbccbf545722d517cbac6627c0e16e59",
        "binding": "0db5b3432c477b982e7495db6eab6f72cf760bc22383096696dd3cad7b8e8545",
        "population": "pop-treated",
        "comparator": null,
        "intervention": "arm-nma-tbi"
      },
      {
        "stage": "R3",
        "source": "a1dcac2ee413ebc6166acdb1ae981223fe8d6f59435221db1c9281c81d10f944",
        "binding": "bec230153586be60e10ce9b3a1408dbe23ca8c5e00819927e9dc111b0b05471e",
        "population": "pop-tbi-r3",
        "comparator": null,
        "intervention": "arm-tbi-r3"
      }
    ],
    "preferred_context": 1,
    "evidence": [
      {
        "id": "CE-bec230153586be60e10ce9b3-span-8965348d65867c94bee344e6",
        "source_id": "report-e4838866b6b3e4ac6b64d41d:main:8d9a0558b3e5ed09",
        "block_id": "b00011",
        "supporting_quote": "One group of 33 patients received non-myeloablative chemotherapy (NMA) consisting of 60mg/kg/day cyclophosphamide for two days followed by five days of 25mg/m 2 /day fludarabine. A second cohort of 23 patients received two days of 60mg/kg cyclophosphamide overlapping the first two of five days of 25mg/m 2 /day fludarabine. On the final day of fludarabine, patients received two fractions of 2Gy TBI separated by at least 6hr, and the following day they received one fraction of 2Gy TBI. On the day following chemotherapy or radiation all patients received a bolus intravenous infusion of CD8+ enriched young TIL and started high dose IL-2 therapy (720,000IU/kg intravenously every 8hr to tolerance). One day after TIL infusion, patients who received 6Gy TBI received a minimum of 2 × 10 6 /kg autologous purified (Miltenyi) CD34+ hematopoietic stem cells from a G-CSF±plerixafor mobilized pheresis."
      },
      {
        "id": "CE-bec230153586be60e10ce9b3-span-dad4b27de30b7c2a514b65fe",
        "source_id": "report-e4838866b6b3e4ac6b64d41d:main:8d9a0558b3e5ed09",
        "block_id": "b00019",
        "supporting_quote": "The safety and efficacy of therapy using CD8+ enriched young TIL following lymphodepletion was investigated in two cohorts of patients with metastatic melanoma. Thirty-three patients received CD8+ enriched TIL with NMA, and 23 patients received CD8+ enriched young TIL following NMA plus 6Gy of total body irradiation (TBI). The demographic characteristics of these patients and the treatments administered are shown in Table 1 . 64% of patients had received prior IL-2. Median follow up as of April 1, 2010 in the NMA and 6Gy TBI cohorts was 14 months and 7 months, respectively."
      }
    ],
    "reason": "Same two treatment cohorts: NMA33 and NMA+6GyTBI23; full text resolves conditioning components and the TBI-arm stem-cell support. Do not merge the two cohorts.",
    "treatment_preferences": {
      "intervention": {
        "context": 1,
        "reason": "The23-person6GyTBI cohort explicitly received overlapping cyclophosphamide/fludarabine, radiation, TIL+IL2, and next-day autologous CD34 stem cells. R3 completes the exact source-described sequence.",
        "evidence": [
          {
            "id": "CE-bec230153586be60e10ce9b3-span-8965348d65867c94bee344e6",
            "source_id": "report-e4838866b6b3e4ac6b64d41d:main:8d9a0558b3e5ed09",
            "block_id": "b00011",
            "supporting_quote": "One group of 33 patients received non-myeloablative chemotherapy (NMA) consisting of 60mg/kg/day cyclophosphamide for two days followed by five days of 25mg/m 2 /day fludarabine. A second cohort of 23 patients received two days of 60mg/kg cyclophosphamide overlapping the first two of five days of 25mg/m 2 /day fludarabine. On the final day of fludarabine, patients received two fractions of 2Gy TBI separated by at least 6hr, and the following day they received one fraction of 2Gy TBI. On the day following chemotherapy or radiation all patients received a bolus intravenous infusion of CD8+ enriched young TIL and started high dose IL-2 therapy (720,000IU/kg intravenously every 8hr to tolerance). One day after TIL infusion, patients who received 6Gy TBI received a minimum of 2 × 10 6 /kg autologous purified (Miltenyi) CD34+ hematopoietic stem cells from a G-CSF±plerixafor mobilized pheresis."
          },
          {
            "id": "CE-bec230153586be60e10ce9b3-span-dad4b27de30b7c2a514b65fe",
            "source_id": "report-e4838866b6b3e4ac6b64d41d:main:8d9a0558b3e5ed09",
            "block_id": "b00019",
            "supporting_quote": "The safety and efficacy of therapy using CD8+ enriched young TIL following lymphodepletion was investigated in two cohorts of patients with metastatic melanoma. Thirty-three patients received CD8+ enriched TIL with NMA, and 23 patients received CD8+ enriched young TIL following NMA plus 6Gy of total body irradiation (TBI). The demographic characteristics of these patients and the treatments administered are shown in Table 1 . 64% of patients had received prior IL-2. Median follow up as of April 1, 2010 in the NMA and 6Gy TBI cohorts was 14 months and 7 months, respectively."
          }
        ]
      }
    }
  },
  {
    "id": "reviewed-9862627:1:2",
    "pmid": "9862627",
    "samples": [
      "16"
    ],
    "contexts": [
      {
        "stage": "R2",
        "source": "778a623c5a9ec1e5d335ef7cb87b3895d938a0cec0ac94b4ce10b48da17101b5",
        "binding": "693069845cd7fc6e19df27385a783d734cda88f0427b94520a9d22dc6cf68858",
        "population": "p1",
        "comparator": null,
        "intervention": "a1"
      },
      {
        "stage": "R3",
        "source": "78d97a58ea9833490ad3d650b223976096588009a3c775b7ee6693d3792fd92c",
        "binding": "b8160a6f2e80f1ea415a8fc632d3b5ad38011ee4ca3c8ead2f3f120c383e1ff1",
        "population": "p_mart_noil2",
        "comparator": null,
        "intervention": "a_mart_noil2"
      }
    ],
    "preferred_context": 1,
    "evidence": [
      {
        "id": "CE-b8160a6f2e80f1ea415a8fc6-span-dcb3aab685a9959c5ae34b48",
        "source_id": "report-a72fc307b341994ed2bebf95:main-html:d8dd1b0049771531",
        "block_id": "b00033",
        "supporting_quote": "Of the 16 patients receiving the escalating doses of adenovirus MART-1 without IL-2, there was one complete response, ongoing at 31 months, in a patient with biopsy-proven progressive melanoma in the mediastinum and breast who received four sequential doses of 10 8 pfu subcutaneously ( Table 1 ; Fig. 1 ). Of the 20 patients who received adenovirus MART-1 plus high-dose IL-2, there were two complete responses and two partial responses."
      }
    ],
    "reason": "Same16 receiving MART-1 adenovirus withoutIL2; source distinguishes20 receiving MART-1 plusIL2."
  },
  {
    "id": "reviewed-39207855:6:26",
    "pmid": "39207855",
    "samples": [
      "16"
    ],
    "contexts": [
      {
        "stage": "R3",
        "source": "d251af5f6fb90e9328514dbf43e96d0b641c7e187b72fa3883e2f9c8de740fca",
        "binding": "e2d84548cff4faeeb0d525d18278acbdd55517e6f60ebc3a98fe8eba51daebd3",
        "population": "p37",
        "comparator": null,
        "intervention": "r3a1"
      },
      {
        "stage": "R3",
        "source": "d251af5f6fb90e9328514dbf43e96d0b641c7e187b72fa3883e2f9c8de740fca",
        "binding": "e2d84548cff4faeeb0d525d18278acbdd55517e6f60ebc3a98fe8eba51daebd3",
        "population": "p26",
        "comparator": null,
        "intervention": "r3a1"
      }
    ],
    "preferred_context": 1,
    "evidence": [
      {
        "id": "CE-e2d84548cff4faeeb0d525d1-span-3872822de2653b3f80e050e7",
        "source_id": "report-11d373954ae4d8dddcb6f449:main:ca78262d65834740",
        "block_id": "b00024",
        "supporting_quote": "Table 1\nBaseline patient characteristics – BRAF cohort\nCharacteristic | N (%)\nSex | \nMale | 59 (55%)\nFemale | 47 (45%)\nTreatment line | \n1 st | 32 (30%)\n2 nd | 58 (55%)\n3 rd | 16 (15%)\nDisease stage | \nIII or IV NED | 22 (21%)\nIV | 84 (79%)\nECOG performance status | \n0–1 | 67 (63%)\n2–3 | 12 (11%)\nUnknown | 27 (26%)\nLDH at treatment initiation | \nWNL | 76 (72%)\n<X2 WNL | 20 (19%)\n>X2 WNL | 10 (9%)\nAgent used | \nDabrafenib + trametinib | 61 (57%)\nEncorafenib + binimetinib | 37 (35%)\nVemurafenib + cobimetinib | 2 (2%)\nSingle agent BRAF inhibitor | 2 (2%)\nCombination BRAF/MEK + anti PD-1/PDL-1 | 4 (4%)\nCNS metastases at treatment initiation | \nYes | 37 (35%)\nNo | 69 (65%)\nMelanoma subtype | \nCutaneous | 75 (71%)\nAcral | 7 (7%)\nUnknown | 23 (22%)\nUveal | 1 (<1%)\nComorbidities of interest | \nAutoimmune disorders | 20 (19%)\nType II diabetes | 18 (17%)\nIschemic heart disease | 12 (11%)\nAtrial fibrillation | 17 (16%)\nSolid organ transplant recipient | 3 (3%)\nECOG, Eastern Cooperative Oncology Group; LDH, lactate dehydrogenase; N/A, not applicable; NED, no evidence of disease; WNL, within normal limits."
      },
      {
        "id": "CE-e2d84548cff4faeeb0d525d1-span-aa58c86518556be3bdbc3244",
        "source_id": "report-11d373954ae4d8dddcb6f449:main:ca78262d65834740",
        "block_id": "b00030",
        "supporting_quote": "Table 2\nResponse rate according to subgroup analysis BRAF cohort\nSubgroup ( n ) – evaluable only | Response rate a n (%) | P -value\nMale (51) | 42 (82%) | \nFemale (37) | 31 (84%) | P = 0.86\nNormal LDH (60) | 49 (82%) | \nElevated LDH (28) | 24 (86%) | P = 0.63\nECOG PS 0–1 (54) | 47 (87%) | \nECOG PS 2–3 (12) | 9 (75%) | P = 0.29\nDabrafenib + trametinib (47) | 38 (81%) | \nEncorafenib + binimetinib (33) | 28 (85%) | P = 0.64\n1 st line (22) | 18 (82%) | Reference\n2 nd line (47) | 39 (83%) | P = 0.9\n3 rd line (16) | 14 (87%) | P = 0.63\nCNS disease (35) | 27 (77%) | \nNo CNS disease (47) | 40 (85%) | P = 0.35\nAge over 75 (11) | 7 (64%) | \nAge 65–75 (77) | 66 (86%) | P = 0.068\nCNS, central nervous system; ECOG PS, Eastern Cooperative Oncology Group performance status; LDH, lactate dehydrogenase. a Systemic response rate only."
      }
    ],
    "reason": "Table1 identifies16 third-line patients; Table2 explicitly defines the response subset as third-line evaluable patients and also includes all16. Same treatment arm and same source; the evaluable subset exhausts that third-line cohort."
  },
  {
    "id": "reviewed-38167503:1:33",
    "pmid": "38167503",
    "samples": [
      "69"
    ],
    "contexts": [
      {
        "stage": "R3",
        "source": "88db27c85237919bcce63fc5db54b54708e0dae07f686613ef9bf29112e9ceab",
        "binding": "1cf1abb31e03ffbae78af344ff3fc0a3abaa60053c1b5018c7b0998929c589aa",
        "population": "pop-overall",
        "comparator": null,
        "intervention": "arm-a"
      },
      {
        "stage": "R3",
        "source": "88db27c85237919bcce63fc5db54b54708e0dae07f686613ef9bf29112e9ceab",
        "binding": "1cf1abb31e03ffbae78af344ff3fc0a3abaa60053c1b5018c7b0998929c589aa",
        "population": "pop-safety",
        "comparator": null,
        "intervention": "arm-a"
      }
    ],
    "preferred_context": 0,
    "evidence": [
      {
        "id": "CE-1cf1abb31e03ffbae78af344-span-bb0b5ceb7bb2be5ea16c1538",
        "source_id": "report-4d81566d4f88530a003a2b8b:main:3650291aa89dea3b",
        "block_id": "b00009",
        "supporting_quote": "Between November 2016 and May 2019, 251 patients with untreated, metastatic BRAFV600 -mutant melanoma were screened. A total of 209 patients from 37 sites in 9 countries were enrolled and randomized across the three treatment arms: 69 in Arm A (encorafenib plus binimetinib until PD followed by ipilimumab plus nivolumab), 71 in Arm B (ipilimumab plus nivolumab until PD followed by encorafenib plus binimetinib), and 69 in Arm C (“sandwich,” encorafenib plus binimetinib for 8 weeks followed by ipilimumab plus nivolumab until PD followed by encorafenib plus binimetinib). The median age of patients in Arms A, B, and C was 55.0 (range 19–77), 55.0 (range 18–81), and 51.0 (range 28–80), with 60.9%, 47.9% and 60.9% of male sex, respectively. Tumor stage was not known for one patient in arm B and one in arm C (Table 1 ). Table 1 Baseline characteristics of the intention-to-treat population Arm A ( n = 69) Arm B ( n = 71) Arm C ( n = 69) Median age, years (range) 55.0 (19–77) 55.0 (18–81) 51.0 (28–80) Gender – Male, n (%) 42 (60.9%) 34 (47.9%) 42 (60.9%) ECOG-PS 0, n (%) 57 (82.6%) 62 (87.3%) 62 (89.9%) Lactate Dehydrogenase (LDH) levels, n (%) \\documentclass[12pt]{minimal} \\usepackage{amsmath} \\usepackage{wasysym} \\usepackage{amsfonts} \\usepackage{amssymb} \\usepackage{amsbsy} \\usepackage{mathrsfs} \\usepackage{upgreek} \\setlength{\\oddsidemargin}{-69pt} \\begin{document}$$\\le$$\\end{document} ≤ 1.00 × ULN 41 (59.4%) 37 (52.1%) 44 (63.8%) >1.00 × ULN 28 (40.6%) 34 (47.9%) 25 (36.2%) >2.00 × ULN 7 (10.1%) 9 (12.7%) 7 (10.1%) Stage, n (%) M0-M1a–M1b 29 (42%) 28 (39.4 %) 29 (42%) M1c 40 (58.0%) 42 (59.1%) 39 (56.5%) Not reported 0 1 (1.5 %) 1 (1.5%) Number of metastatic sites, n (%) <3 ≥3 Not evaluated 43 (62.3%) 25 (36.2%) 1 (1.5%) 41 (57.7%) 29 (40.9%) 1 (1.4%) 43 (62.3%) 25 (36.2%) 1 (1.5%) Stage is reported as described in the American Joint Commission on Cancer Cancer Staging Manual, Version 7."
      },
      {
        "id": "CE-1cf1abb31e03ffbae78af344-span-54824135f51c7cab553e670a",
        "source_id": "report-4d81566d4f88530a003a2b8b:main:3650291aa89dea3b",
        "block_id": "b00010",
        "supporting_quote": "As of June, 2022, 4 years from treatment, among the 206 patients who received at least 1 dose of the study sequence ( n = 69, n = 69, and n = 68 in Arms A, B, and C, respectively), 64 remained on treatment ( n = 17, n = 24, and n = 23 in Arms A, B, and C, respectively). The numbers of patients who completed the entire sequence (ie, PD on treatment 1 and on treatment 2) were 19, 10, and 20 in Arms A, B, and C, respectively. During treatment across the arms, there were 13 deaths in Arm A (7 during encorafenib plus binimetinib treatment and 6 during ipilimumab plus nivolumab treatment), 11 deaths in Arm B (3 during the ipilimumab plus nivolumab treatment and 8 during encorafenib plus binimetinib treatment), and 4 deaths in Arm C (2 during the ipilimumab plus nivolumab treatment and 2 during second treatment of encorafenib plus binimetinib treatment). Adverse events led to treatment discontinuation in 11 patients in Arm A, 10 patients in Arm B, and 11 patients in Arm C (Supplementary Fig. 1 )."
      }
    ],
    "reason": "ArmA has69 randomized participants and69 receiving at least one dose. The safety subset is the complete ArmA cohort. ArmB and ArmC are different sequences and remain separate even when N69."
  },
  {
    "id": "reviewed-28019090:2:5",
    "pmid": "28019090",
    "samples": [
      "106"
    ],
    "contexts": [
      {
        "stage": "R3",
        "source": "70832924eb2c3209e04fe1de2fc4b058a532885b9b3903dd38ef083c3a4b861b",
        "binding": "961fb39220b28db8f331b2555394765465a5d4029b9f531f518fb710a59b6b5a",
        "population": "pop-efficacy-003",
        "comparator": null,
        "intervention": "arm-efficacy-003"
      },
      {
        "stage": "R3",
        "source": "70832924eb2c3209e04fe1de2fc4b058a532885b9b3903dd38ef083c3a4b861b",
        "binding": "961fb39220b28db8f331b2555394765465a5d4029b9f531f518fb710a59b6b5a",
        "population": "pop-safety-003",
        "comparator": null,
        "intervention": "arm-safety-003"
      }
    ],
    "preferred_context": 0,
    "evidence": [
      {
        "id": "CE-961fb39220b28db8f331b255-span-86d09a3c5b7f5a516ae71689",
        "source_id": "report-e962c44e69d852a228f6fe8b:supplement:e5fb52406dbedd7f",
        "block_id": "s00002",
        "supporting_quote": "Study | Nivolumab treatment regimen | Sample size\nCA209003 (NCT00730639) Design: Phase 1, open-label, multicenter, multi-dose, dose-escalation study to evaluate the safety and tolerability of nivolumab in patients with selected advanced or recurrent malignancies Population: Adult patients with pathologically verified and advanced or recurrent and progressing colorectal adenocarcinoma, melanoma, non-small–cell lung cancer, castrate-resistant prostate adenocarcinoma, and renal cell carcinomaa | Dose: 0.1, 0.3, 1.0, 3.0, or 10.0 mg/kg IV infusion depending upon tumor type, administered over 60 minutes every 2 weeks for up to twelve 8-week cycles Patients in 0.1 and 0.3 mg/kg were eligible to receive 1 mg/kg every 2 weeks | 106 in E-R efficacy 106 in E-R safety\nCA209037 (NCT01721746): A randomized, open-label phase 3 trial of nivolumab vs. investigator's choice in patients with advanced (unresectable or metastatic) melanoma progressing after anti-CTLA-4 therapy Population: Patients with advanced melanoma | Dose: 3.0 mg/kg, 1-hour IV infusion Regimen: Every 2 weeks | E–R efficacy,b n = 115 E–R safety,c n = 230"
      },
      {
        "id": "CE-961fb39220b28db8f331b255-span-2f633dc1e8b10bf0da7e443a",
        "source_id": "report-e962c44e69d852a228f6fe8b:supplement:e5fb52406dbedd7f",
        "block_id": "s00003",
        "supporting_quote": "CTLA-4: cytotoxic T-lymphocyte–associated antigen 4; E–R: exposure–response; IV: intravenous.\naAnalyses only included patients with advanced melanoma.\nbEfficacy population: patients with response assessment and available nivolumab exposure measure."
      },
      {
        "id": "CE-961fb39220b28db8f331b255-span-3f7c3180d3d25d3f78a17e7a",
        "source_id": "report-e962c44e69d852a228f6fe8b:supplement:e5fb52406dbedd7f",
        "block_id": "s00004",
        "supporting_quote": "cSafety population: patients with available nivolumab exposure measure."
      }
    ],
    "reason": "Table lists106 CA209003 participants in both efficacy and safety analyses. Source defines efficacy as response-assessed patients with nivolumab exposure and safety as patients with exposure: the efficacy subset exhausts the same106-person trial safety cohort. The two arm IDs distinguish analysis use, not treatment."
  },
  {
    "id": "reviewed-19901107:1:2",
    "pmid": "19901107",
    "samples": [
      "90"
    ],
    "contexts": [
      {
        "stage": "R3",
        "source": "18c532963a7ce8157f5e48f057294b6ea104615a3d4aaf5ad10db9c306af505b",
        "binding": "801f89612c026f2f9d8be9b9a068923db758950e2db83adbb750b9beae635db0",
        "population": "p_surv",
        "comparator": null,
        "intervention": "a_all"
      },
      {
        "stage": "R3",
        "source": "18c532963a7ce8157f5e48f057294b6ea104615a3d4aaf5ad10db9c306af505b",
        "binding": "801f89612c026f2f9d8be9b9a068923db758950e2db83adbb750b9beae635db0",
        "population": "p_response",
        "comparator": null,
        "intervention": "a_all"
      }
    ],
    "preferred_context": 1,
    "evidence": [
      {
        "id": "CE-801f89612c026f2f9d8be9b9-span-d68769490aa6008d760b3c19",
        "source_id": "report-284b64f76afd21e353e5211d:main-html:9538acd405e79cc4",
        "block_id": "b00018",
        "supporting_quote": "The overall response rate was 95% (85 of 90 evaluable); there were 62 patients (69%) who had a complete response (CR) and the overall median in-field progression-free survival (PFS) was 12.4 months. With a median potential follow-up time of 11 years, the median overall survival (OS) was 47.4 months and the 5- and 10-year actuarial OS probabilities were 43% and 34%, respectively ( Fig 1 )."
      },
      {
        "id": "CE-801f89612c026f2f9d8be9b9-span-9de626f82649b00364cae58a",
        "source_id": "report-284b64f76afd21e353e5211d:main-html:9538acd405e79cc4",
        "block_id": "b00019",
        "supporting_quote": "Fig 1. Open in a new tab Actuarial (A) overall survival and (B) in-field progression-free survival in 90 patients after isolated limb perfusion (ILP) for melanoma."
      }
    ],
    "reason": "The same results paragraph reports85 responses among90 evaluable patients with subsequent median PFS/OS, and Fig1 explicitly labels survival analyses in90 ILP patients. The report has91 treated with one operative death. This source-specific presentation alias joins the90 analyzed patients, not the91 treated population."
  },
  {
    "id": "reviewed-39801681:til-recipients-r2-r3",
    "pmid": "39801681",
    "samples": [
      "9"
    ],
    "contexts": [
      {
        "stage": "R2",
        "source": "2ad0022dc90a701b474fe70b490b9a11698136f81181449b07b0f1a8b94859d8",
        "binding": "e3afbfd10131fd0bb50533410062be8a9e7446b86ba79936dce87431234d4163",
        "population": "p2",
        "comparator": null,
        "intervention": "a1"
      },
      {
        "stage": "R3",
        "source": "707f3d22a5c59fc25122690e1214544f7c1893fd9848e24db190c2e73c0486fb",
        "binding": "58af403ed2f1e0f04b51a973596b15dfb03aa7190ad74357e03ce887caf8dfb5",
        "population": "p2",
        "comparator": null,
        "intervention": "a1",
        "allow_missing_arm": true
      }
    ],
    "preferred_context": 1,
    "evidence": [
      {
        "id": "CE-58af403ed2f1e0f04b51a973-span-5a101f170439140a5a6399a7",
        "source_id": "report-43bff62b678adf4919923166:main:88f393ac11d6ca63",
        "block_id": "b00021",
        "supporting_quote": "Between 2020 and 2022, 11 patients were enrolled in the BaseTIL trial and 9 underwent a TIL transfer. Two patients did not start LD: one patient due to rapid disease progression and one patient due to bacterial contamination of the TIL product due to non-adequate starting material. Among the nine patients who had received the TIL infusion (full analysis set), five patients were male and four female ( Table 1 ). The median age was 61 years (range, 35-66 years). Three patients had a BRAF mutation. The median number of prior systemic treatment lines, both in the adjuvant and the metastatic settings, was three (range, one to five). Prior systemic treatments included therapy with a PD-1 inhibitor in all patients, and treatment with a BRAF and MEK inhibitor in all three patients with a BRAF mutation as required by the study protocol. One patient underwent surgery of a newly diagnosed hemorrhagic brain metastasis and whole brain radiotherapy before the start of lymphodepletion. All patients had poly-metastatic disease (≥5 metastatic lesions) after tumor collection and most patients (5/9) had visceral organ involvement. The median sum of target lesion diameters before TIL treatment was 4.8 cm (range, 2.3-10.4 cm). Median level of blood lactate dehydrogenase at the start of lymphodepletion was 187 U/l (range, 145-265 U/l). Table 1 Patient and disease characteristics and treatment aspects Table 1 Patient and disease characteristics Full analysis set a ( N = 9) Median age at TIL transfer (range), years 61 (35-66) Gender (female/male), n 4/5 BRAF mutation b , n (%) 3 (33) Prior systemic therapies, n (%) • Median number of therapies (range) 3 (1-5) • Anti-PD-1 9 (100) • Anti-CTLA-4 2 (22) • Combined anti-PD-1/anti-CTLA-4 6 (67) • BRAF + MEK inhibitor 3 (33) • Chemotherapy or interferon treatment 3 (33) • Experimental treatment 2 (22) Median target lesion sum of diameters (range), mm 48 (23-104) Presence of brain metastases c (yes/no), n 1/8 Median level of LDH (range), U/l 187 (145-265) CTLA-4, cytotoxic T lymphocyte-associated antigen-4; LDH, lactate dehydrogenase; PD-1, programmed cell death protein 1; TIL, tumor-infiltrating lymphocytes. a The full analysis set includes nine patients who underwent TIL transfer. Overall, two patients did not start lymphodepleting chemotherapy: one patient due to rapid disease progression; one patient due to bacterial contamination of the TIL product due to non-adequate starting material. b BRAF mutations: V600E, V600E/D, V600E. c The presence of uncontrolled brain metastases was an exclusion criterion in the study protocol. One patient was diagnosed with brain metastases shortly after study enrollment and underwent surgery of a hemorrhagic brain metastasis and whole brain radiotherapy before the start of lymphodepleting chemotherapy. Stability of brain metastases was documented before start of lymphodepleting chemotherapy."
      },
      {
        "id": "CE-58af403ed2f1e0f04b51a973-span-8a8186cfa99201a6afdbe919",
        "source_id": "report-43bff62b678adf4919923166:main:88f393ac11d6ca63",
        "block_id": "b00024",
        "supporting_quote": "Median duration of hospitalization for TIL-ACT was 25 days (range, 20-44 days). All patients experienced AEs in the period from start of LD (day −7) until 30 days after TIL transfer ( Table 3 ). Hematologic AEs occurred as expected in all patients and were attributed to LD. Highest-grade events were grade 4 white blood count decrease (9/9 patients), grade 4 neutropenia (9/9 patients), grade 4 lymphopenia (9/9 patients), grade 4 platelet count decrease (7/9 patients), and grade 3 anemia (7/9 patients). The most common non-hematological AEs of grade 2 or higher in the above-mentioned period were fever (7/9) and CRS (5/9). One patient experienced a grade 4 CRS, classified as serious AE, which led to trial discontinuation. This patient experienced progressive signs of an acute respiratory distress syndrome (ARDS) resulting in respiratory failure and need of invasive respiratory support shortly after TIL infusion and the first IL-2 dose. Multi-organ failure occurred with cardiac, gastrointestinal, and neurological involvement. The patient received anti-IL-6 targeted treatment (tocilizumab, siltuximab) and high-dose steroid treatment. She fully recovered from the episode but required prolonged hospitalization. The patient did not proceed with any study treatment and did not receive nivolumab. Among the other four patients with grade 2 CRS, three patients received tocilizumab. All patients received antibiotic treatment during TIL-ACT. Table 3 Adverse events of grade 2 or higher. Shown are all adverse events (≥grade 2) ( n , %) of the highest grade recorded for all TIL-treated patients ( N = 9) from start of lymphodepletion (day −7) until 30 days after TIL transfer (day +30) Table 3 CTCAE preferred term, n (%) Any grade Grade 2 Grade 3 Grade 4 Non-hematologic adverse events Fever/chills 7 (78) 7 (78) 0 (0) 0 (0) Cytokine release syndrome (CRS) 5 (56) 4 (44) 0 (0) 1 (11) a Hypertension 4 (44) 2 (22) 2 (22) 0 (0) Pain b 3 (33) 2 (22) 1 (11) 0 (0) Liver enzyme elevation c 2 (22) 1 (11) 1 (11) 0 (0) Skin alterations d 2 (22) 1 (11) 1 (11) 0 (0) Hypotension 2 (22) 2 (22) 0 (0) 0 (0) Nausea/vomiting 2 (22) 2 (22) 0 (0) 0 (0) Pre-syncope/syncope 2 (22) 2 (22) 0 (0) 0 (0) Creatinine increased 1 (11) 0 (0) 1 (11) 0 (0) Wound infection 1 (11) 0 (0) 1 (11) 0 (0) Atrial fibrillation 1 (11) 1 (11) 0 (0) 0 (0) Cystitis noninfective 1 (11) 1 (11) 0 (0) 0 (0) Fatigue 1 (11) 1 (11) 0 (0) 0 (0) Headache 1 (11) 1 (11) 0 (0) 0 (0) Mucositis oral 1 (11) 1 (11) 0 (0) 0 (0) Peripheral sensory neuropathy 1 (11) 1 (11) 0 (0) 0 (0) Pleural effusion 1 (11) 1 (11) 0 (0) 0 (0) Hematologic adverse events White blood cell decreased 9 (100) 0 (0) 0 (0) 9 (100) Lymphocyte count decreased 9 (100) 0 (0) 0 (0) 9 (100) Neutrophil count decreased 9 (100) 0 (0) 0 (0) 9 (100) Anemia 9 (100) 2 (22) 7 (78) 0 (0) Platelet count decreased 9 (100) 0 (0) 2 (22) 7 (78) Hemolysis 1 (11) 0 (0) 1 (11) 0 (0) TIL, tumor-infiltrating lymphocytes. a One patient with a CRS (grade 4) with multi-organ failure (classified as serious adverse event). b One patient with back pain (grade 3), one patient with bone pain (grade 2), one patient with non-cardiac chest pain (grade 2). c Elevation of alanine aminotransferase (ALT), aspartate aminotransferase (AST) and/or GGT. d One patient with maculopapular rash (grade 2), one patient with purpura (grade 3)."
      },
      {
        "id": "CE-e3afbfd10131fd0bb5053341-span-0f20f5bc7db4704958a32a15",
        "source_id": "report-43bff62b678adf4919923166:citation",
        "block_id": "abstract",
        "supporting_quote": "RESULTS: Between 2020 and 2022, we enrolled 11 patients and 9 underwent a TIL transfer (median transfused cell number: 66.25 × 109). Two patients did not start lymphodepletion. Nine patients received at least 1 dose of interleukin 2 (median number: 10; range, 1-10), seven started nivolumab (median number: 5; range, 2-23). All patients had hematologic adverse events (AEs). Most common non-hematologic AEs were fever and cytokine release syndrome. No nivolumab-associated AEs of ≥ grade 2 occurred. The objective response rate to TIL-ACT was 22% (2/9, 2 partial remission).\n"
      }
    ],
    "reason": "R2 TIL transfer recipients and R3 full analysis set are the same nine recipients, explicitly described in both source records."
  },
  {
    "id": "reviewed-39801681:all-til-safety",
    "pmid": "39801681",
    "samples": [
      "9"
    ],
    "contexts": [
      {
        "stage": "R3",
        "source": "707f3d22a5c59fc25122690e1214544f7c1893fd9848e24db190c2e73c0486fb",
        "binding": "58af403ed2f1e0f04b51a973596b15dfb03aa7190ad74357e03ce887caf8dfb5",
        "population": "p2",
        "comparator": null,
        "intervention": "a1",
        "allow_missing_arm": true
      },
      {
        "stage": "R3",
        "source": "707f3d22a5c59fc25122690e1214544f7c1893fd9848e24db190c2e73c0486fb",
        "binding": "58af403ed2f1e0f04b51a973596b15dfb03aa7190ad74357e03ce887caf8dfb5",
        "population": "p7",
        "comparator": null,
        "intervention": "a1",
        "allow_missing_arm": true
      }
    ],
    "preferred_context": 0,
    "evidence": [
      {
        "id": "CE-58af403ed2f1e0f04b51a973-span-5a101f170439140a5a6399a7",
        "source_id": "report-43bff62b678adf4919923166:main:88f393ac11d6ca63",
        "block_id": "b00021",
        "supporting_quote": "Between 2020 and 2022, 11 patients were enrolled in the BaseTIL trial and 9 underwent a TIL transfer. Two patients did not start LD: one patient due to rapid disease progression and one patient due to bacterial contamination of the TIL product due to non-adequate starting material. Among the nine patients who had received the TIL infusion (full analysis set), five patients were male and four female ( Table 1 ). The median age was 61 years (range, 35-66 years). Three patients had a BRAF mutation. The median number of prior systemic treatment lines, both in the adjuvant and the metastatic settings, was three (range, one to five). Prior systemic treatments included therapy with a PD-1 inhibitor in all patients, and treatment with a BRAF and MEK inhibitor in all three patients with a BRAF mutation as required by the study protocol. One patient underwent surgery of a newly diagnosed hemorrhagic brain metastasis and whole brain radiotherapy before the start of lymphodepletion. All patients had poly-metastatic disease (≥5 metastatic lesions) after tumor collection and most patients (5/9) had visceral organ involvement. The median sum of target lesion diameters before TIL treatment was 4.8 cm (range, 2.3-10.4 cm). Median level of blood lactate dehydrogenase at the start of lymphodepletion was 187 U/l (range, 145-265 U/l). Table 1 Patient and disease characteristics and treatment aspects Table 1 Patient and disease characteristics Full analysis set a ( N = 9) Median age at TIL transfer (range), years 61 (35-66) Gender (female/male), n 4/5 BRAF mutation b , n (%) 3 (33) Prior systemic therapies, n (%) • Median number of therapies (range) 3 (1-5) • Anti-PD-1 9 (100) • Anti-CTLA-4 2 (22) • Combined anti-PD-1/anti-CTLA-4 6 (67) • BRAF + MEK inhibitor 3 (33) • Chemotherapy or interferon treatment 3 (33) • Experimental treatment 2 (22) Median target lesion sum of diameters (range), mm 48 (23-104) Presence of brain metastases c (yes/no), n 1/8 Median level of LDH (range), U/l 187 (145-265) CTLA-4, cytotoxic T lymphocyte-associated antigen-4; LDH, lactate dehydrogenase; PD-1, programmed cell death protein 1; TIL, tumor-infiltrating lymphocytes. a The full analysis set includes nine patients who underwent TIL transfer. Overall, two patients did not start lymphodepleting chemotherapy: one patient due to rapid disease progression; one patient due to bacterial contamination of the TIL product due to non-adequate starting material. b BRAF mutations: V600E, V600E/D, V600E. c The presence of uncontrolled brain metastases was an exclusion criterion in the study protocol. One patient was diagnosed with brain metastases shortly after study enrollment and underwent surgery of a hemorrhagic brain metastasis and whole brain radiotherapy before the start of lymphodepleting chemotherapy. Stability of brain metastases was documented before start of lymphodepleting chemotherapy."
      },
      {
        "id": "CE-58af403ed2f1e0f04b51a973-span-8a8186cfa99201a6afdbe919",
        "source_id": "report-43bff62b678adf4919923166:main:88f393ac11d6ca63",
        "block_id": "b00024",
        "supporting_quote": "Median duration of hospitalization for TIL-ACT was 25 days (range, 20-44 days). All patients experienced AEs in the period from start of LD (day −7) until 30 days after TIL transfer ( Table 3 ). Hematologic AEs occurred as expected in all patients and were attributed to LD. Highest-grade events were grade 4 white blood count decrease (9/9 patients), grade 4 neutropenia (9/9 patients), grade 4 lymphopenia (9/9 patients), grade 4 platelet count decrease (7/9 patients), and grade 3 anemia (7/9 patients). The most common non-hematological AEs of grade 2 or higher in the above-mentioned period were fever (7/9) and CRS (5/9). One patient experienced a grade 4 CRS, classified as serious AE, which led to trial discontinuation. This patient experienced progressive signs of an acute respiratory distress syndrome (ARDS) resulting in respiratory failure and need of invasive respiratory support shortly after TIL infusion and the first IL-2 dose. Multi-organ failure occurred with cardiac, gastrointestinal, and neurological involvement. The patient received anti-IL-6 targeted treatment (tocilizumab, siltuximab) and high-dose steroid treatment. She fully recovered from the episode but required prolonged hospitalization. The patient did not proceed with any study treatment and did not receive nivolumab. Among the other four patients with grade 2 CRS, three patients received tocilizumab. All patients received antibiotic treatment during TIL-ACT. Table 3 Adverse events of grade 2 or higher. Shown are all adverse events (≥grade 2) ( n , %) of the highest grade recorded for all TIL-treated patients ( N = 9) from start of lymphodepletion (day −7) until 30 days after TIL transfer (day +30) Table 3 CTCAE preferred term, n (%) Any grade Grade 2 Grade 3 Grade 4 Non-hematologic adverse events Fever/chills 7 (78) 7 (78) 0 (0) 0 (0) Cytokine release syndrome (CRS) 5 (56) 4 (44) 0 (0) 1 (11) a Hypertension 4 (44) 2 (22) 2 (22) 0 (0) Pain b 3 (33) 2 (22) 1 (11) 0 (0) Liver enzyme elevation c 2 (22) 1 (11) 1 (11) 0 (0) Skin alterations d 2 (22) 1 (11) 1 (11) 0 (0) Hypotension 2 (22) 2 (22) 0 (0) 0 (0) Nausea/vomiting 2 (22) 2 (22) 0 (0) 0 (0) Pre-syncope/syncope 2 (22) 2 (22) 0 (0) 0 (0) Creatinine increased 1 (11) 0 (0) 1 (11) 0 (0) Wound infection 1 (11) 0 (0) 1 (11) 0 (0) Atrial fibrillation 1 (11) 1 (11) 0 (0) 0 (0) Cystitis noninfective 1 (11) 1 (11) 0 (0) 0 (0) Fatigue 1 (11) 1 (11) 0 (0) 0 (0) Headache 1 (11) 1 (11) 0 (0) 0 (0) Mucositis oral 1 (11) 1 (11) 0 (0) 0 (0) Peripheral sensory neuropathy 1 (11) 1 (11) 0 (0) 0 (0) Pleural effusion 1 (11) 1 (11) 0 (0) 0 (0) Hematologic adverse events White blood cell decreased 9 (100) 0 (0) 0 (0) 9 (100) Lymphocyte count decreased 9 (100) 0 (0) 0 (0) 9 (100) Neutrophil count decreased 9 (100) 0 (0) 0 (0) 9 (100) Anemia 9 (100) 2 (22) 7 (78) 0 (0) Platelet count decreased 9 (100) 0 (0) 2 (22) 7 (78) Hemolysis 1 (11) 0 (0) 1 (11) 0 (0) TIL, tumor-infiltrating lymphocytes. a One patient with a CRS (grade 4) with multi-organ failure (classified as serious adverse event). b One patient with back pain (grade 3), one patient with bone pain (grade 2), one patient with non-cardiac chest pain (grade 2). c Elevation of alanine aminotransferase (ALT), aspartate aminotransferase (AST) and/or GGT. d One patient with maculopapular rash (grade 2), one patient with purpura (grade 3)."
      },
      {
        "id": "CE-e3afbfd10131fd0bb5053341-span-0f20f5bc7db4704958a32a15",
        "source_id": "report-43bff62b678adf4919923166:citation",
        "block_id": "abstract",
        "supporting_quote": "RESULTS: Between 2020 and 2022, we enrolled 11 patients and 9 underwent a TIL transfer (median transfused cell number: 66.25 × 109). Two patients did not start lymphodepletion. Nine patients received at least 1 dose of interleukin 2 (median number: 10; range, 1-10), seven started nivolumab (median number: 5; range, 2-23). All patients had hematologic adverse events (AEs). Most common non-hematologic AEs were fever and cytokine release syndrome. No nivolumab-associated AEs of ≥ grade 2 occurred. The objective response rate to TIL-ACT was 22% (2/9, 2 partial remission).\n"
      }
    ],
    "reason": "Safety passage explicitly describes all TIL-treated patients (N=9), from lymphodepletion through day30 after TIL transfer. Keep the safety time window on results while avoiding a duplicate cohort row."
  },
  {
    "id": "reviewed-37286303:2:9",
    "pmid": "37286303",
    "samples": [
      "43"
    ],
    "contexts": [
      {
        "stage": "R3",
        "source": "4fa78cf431e8a91d37d6979ee0958783fde513c677858e748c94ca48dff113a3",
        "binding": "22336573c3cce0e1e298eefb0b204844132d9517904d02211b3a996edbe96d62",
        "population": "pop_efficacy",
        "comparator": null,
        "intervention": "arm1"
      },
      {
        "stage": "R3",
        "source": "4fa78cf431e8a91d37d6979ee0958783fde513c677858e748c94ca48dff113a3",
        "binding": "22336573c3cce0e1e298eefb0b204844132d9517904d02211b3a996edbe96d62",
        "population": "pop_all",
        "comparator": null,
        "intervention": "arm1"
      }
    ],
    "preferred_context": 1,
    "evidence": [
      {
        "id": "CE-22336573c3cce0e1e298eefb-span-ec4ea34fe7fd351ac1cb1843",
        "source_id": "report-fd929ab24db072096b604284:main:911f1760da5ab9f0",
        "block_id": "b00029",
        "supporting_quote": "The safety analysis set comprised all patients who received ≥1 full or partial dose of tebentafusp, durvalumab, or tremelimumab, with patients classified according to their assigned arm. The efficacy analysis set comprised patients assigned to treatment in Arms 1 (tebentafusp+durvalumab) and 3 (triplet therapy) and who received ≥1 full or partial dose of tebentafusp, durvalumab, or tremelimumab. Arm 2 (tebentafusp+tremelimumab) was excluded from efficacy analyses due to too few patients for meaningful analyses (n=13). Sensitivity analyses of patients in the efficacy analysis set who progressed on prior anti-PD(L)1 therapy were also conducted (sensitivity analysis set)."
      },
      {
        "id": "CE-22336573c3cce0e1e298eefb-span-293f12115951a30a96ad6f7e",
        "source_id": "report-fd929ab24db072096b604284:main:911f1760da5ab9f0",
        "block_id": "b00034",
        "supporting_quote": "<table-wrap position=\"float\" id=\"T1\" orientation=\"portrait\"><label>Table 1</label><caption><p>Baseline patient demographics and clinical characteristics</p></caption><table frame=\"hsides\" rules=\"groups\"><thead><tr><td align=\"left\" valign=\"bottom\" rowspan=\"1\" colspan=\"1\" /><td align=\"left\" valign=\"bottom\" rowspan=\"1\" colspan=\"1\">Arm 1: tebentafusp +durvalumab (N=43)</td><td align=\"left\" valign=\"bottom\" rowspan=\"1\" colspan=\"1\">Arm 2: tebentafusp +tremelimumab (N=13)</td><td align=\"left\" valign=\"bottom\" rowspan=\"1\" colspan=\"1\">Arm 3: tebentafusp +durvalumab +tremelimumab (N=29)</td><td align=\"left\" valign=\"bottom\" rowspan=\"1\" colspan=\"1\">All patients (N=85)</td><td align=\"left\" valign=\"bottom\" rowspan=\"1\" colspan=\"1\">Efficacy population*(N=72)</td><td align=\"left\" valign=\"bottom\" rowspan=\"1\" colspan=\"1\">Sensitivity population†(N=58)</td></tr></thead><tbody><tr><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">Median age (range), years</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">59 (28–79)</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">52 (30–74)</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">58 (30–79)</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">58 (28–79)</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">59 (28–79)</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">58 (29–79)</td></tr><tr><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"2\">ECOG performance status, n (%)</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\" /><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\" /><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\" /><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\" /><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\" /></tr><tr><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\"> 0</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">34 (79)</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">5 (38)</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">26 (90)</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">65 (76)</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">60 (83)</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">47 (81)</td></tr><tr><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\"> 1</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">9 (21)</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">8 (62)</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">3 (10)</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">20 (24)</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">12 (17)</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">11 (19)</td></tr><tr><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"2\">Lactate dehydrogenase, n (%)</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\" /><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\" /><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\" /><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\" /><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\" /></tr><tr><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\"> ≤ULN</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">16 (37)</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">5 (38)</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">13 (45)</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">34 (40)</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">29 (40)</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">24 (41)</td></tr><tr><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\"> &gt;ULN</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">18 (42)</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">3 (23)</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">11 (38)</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">32 (38)</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">29 (40)</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">23 (40)</td></tr><tr><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\"> Missing</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">9 (21)</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">5 (38)</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">5 (17)</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">19 (22)</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">14 (19)</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">11 (19)</td></tr><tr><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">BRAFm, n (%)</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">19 (44)</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">6 (46)</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">8 (28)</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">33 (39)</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">27 (38)</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">22 (38)</td></tr><tr><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\"> BRAFm pts who received inhibitors</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">13 (68)</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">6 (100)</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">6 (75)</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">25 (76)</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">19 (70)</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">16 (73)</td></tr><tr><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"2\">Prior lines of metastatic therapy, n (%)</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\" /><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\" /><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\" /><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\" /><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\" /></tr><tr><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\"> 1L</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">11 (26)</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">1 (8)</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">5 (17)</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">17 (20)</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">16 (22)</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">10 (17)</td></tr><tr><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\"> 2L</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">9 (21)</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">1 (8)</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">7 (24)</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">17 (20)</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">16 (22)</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">16 (28)</td></tr><tr><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\"> 3L</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">5 (12)</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">5 (38)</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">8 (28)</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">18 (21)</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">13 (18)</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">12 (21)</td></tr><tr><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\"> 4L+</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">13 (30)</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">6 (46)</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">6 (21)</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">25 (30)</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">19 (26)</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">18 (31)</td></tr><tr><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"2\">Prior immunotherapy</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\" /><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\" /><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\" /><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\" /><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\" /></tr><tr><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"2\"> Checkpoint inhibitors</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\" /><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\" /><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\" /><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\" /><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\" /></tr><tr><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\"> Anti-PD(L)1</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">36 (84)</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">13 (100)</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">27 (93)</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">76 (89)</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">63 (88)</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">58 (100)</td></tr><tr><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\"> Anti-CTLA4</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">32 (74)</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">13 (100)</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">19 (66)</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">64 (75)</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">51 (71)</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">44 (76)</td></tr><tr><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\"> TIL therapy</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">1 (2)</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">2 (15)</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">3 (10)</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">6 (7)</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">4 (6)</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">4 (7)</td></tr><tr><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\"> Tebentafusp</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">0</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">0</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">1 (3)</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">1 (1)</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">1 (1)</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">1 (2)</td></tr><tr><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\"> Other</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">18 (42)</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">3 (23)</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">8 (28)</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">29 (34)</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">26 (36)</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">22 (38)</td></tr><tr><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"2\">BOR to prior anti-PD(L)1 therapy, n (%)</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\" /><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\" /><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\" /><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\" /><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\" /></tr><tr><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\"> CR/PR/SD (ie, relapsed)</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">21 (46)</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">10 (77)</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">16 (55)</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">47 (55)</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">37 (51)</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">34 (59)</td></tr><tr><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\"> PD (ie, refractory)</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">11 (26)</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">3 (23)</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">10 (34)</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">24 (28)</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">21 (29)</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">19 (33)</td></tr><tr><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\"> Missing</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">4 (9)</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">0</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">1 (3)</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">5 (6)</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">5 (7)</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">5 (9)</td></tr></tbody></table><table-wrap-foot><fn id=\"T1_FN1\"><p>*The efficacy analysis population consists of patients treated with tebentafusp and durvalumab±tremelimumab (Arms 1 and 3).</p></fn><fn id=\"T1_FN2\"><p>†The sensitivity analysis population consists of patients treated with tebentafusp and durvalumab±tremelimumab who discontinued prior anti-PD(L)1 due to disease progression.</p></fn><fn id=\"T1_FN3\"><p>BOR, best overall response; BRAFm, BRAF mutation; CR, complete response; CTLA4, cytotoxic T-lymphocyte-associated antigen 4; ECOG, Eastern Cooperative Oncology Group; 1L, first line; 2L, second line; 3L, third line; 4L+, fourth line and beyond; PD, progressive disease; PD(L)1, programmed death (ligand) 1; PD(L)1, programmed death (ligand) 1; PR, partial response; SD, stable disease; TIL, tumor infiltrating lymphocyte; ULN, upper limit of normal.</p></fn></table-wrap-foot></table-wrap>"
      },
      {
        "id": "CE-22336573c3cce0e1e298eefb-span-31c496c59986fc76b4f5a70c",
        "source_id": "report-fd929ab24db072096b604284:main:911f1760da5ab9f0",
        "block_id": "b00033",
        "supporting_quote": "All patients enrolled, N=85, received at least one dose of study treatment and contributed to the safety analysis. This included 43 patients who were assigned to receive tebentafusp+durvalumab (Arm 1), 13 assigned to receive tebentafusp+tremelimumab (Arm 2), and 29 assigned to receive triplet therapy (Arm 3). Among patients enrolled, 81 (95%) had CM and 4 (5%) had mucosal melanoma. The median age was 58 (range 28–79), 76% were ECOG 0, and 38% had baseline lactate dehydrogenase (LDH) above the upper limit of normal (ULN) ( table 1 ). Thirty-three (39%) patients had mutated BRAF, of whom 30 had BRAFV600 mutations and 25 had received prior BRAF/MEK inhibitors (7 single agents and 18 combinations). The median number of prior metastatic lines of therapy was 3 (range 1–4) with nearly all patients (76/85 (89%)) receiving prior anti-PD(L)1 therapy; of whom 80% also received prior ipilimumab. Of the 72 patients who were assigned to receive tebentafusp and durvalumab±tremelimumab (Arms 1 and 3), 63 received prior anti-PD(L)1 therapy, of which 58 were reported as having discontinued prior anti-PD(L)1 therapy due to disease progression. Thirty-four of these 58 patients (59%) were documented as relapsed (best overall response (BOR)=stable disease (SD)/partial response (PR)/complete response (CR)) and 19/58 (33%) as primary refractory (BOR=PD) to prior anti-PD(L)1 therapy."
      }
    ],
    "reason": "All 85 enrolled patients received at least one dose. Efficacy includes every treated patient in Arms 1 and 3; only Arm 2 was excluded. Thus the arm-specific overall and efficacy populations are identical (Arm 1: 43; Arm 3: 29)."
  },
  {
    "id": "reviewed-37286303:3:11",
    "pmid": "37286303",
    "samples": [
      "29"
    ],
    "contexts": [
      {
        "stage": "R3",
        "source": "4fa78cf431e8a91d37d6979ee0958783fde513c677858e748c94ca48dff113a3",
        "binding": "22336573c3cce0e1e298eefb0b204844132d9517904d02211b3a996edbe96d62",
        "population": "pop_efficacy",
        "comparator": null,
        "intervention": "arm3"
      },
      {
        "stage": "R3",
        "source": "4fa78cf431e8a91d37d6979ee0958783fde513c677858e748c94ca48dff113a3",
        "binding": "22336573c3cce0e1e298eefb0b204844132d9517904d02211b3a996edbe96d62",
        "population": "pop_all",
        "comparator": null,
        "intervention": "arm3"
      }
    ],
    "preferred_context": 1,
    "evidence": [
      {
        "id": "CE-22336573c3cce0e1e298eefb-span-ec4ea34fe7fd351ac1cb1843",
        "source_id": "report-fd929ab24db072096b604284:main:911f1760da5ab9f0",
        "block_id": "b00029",
        "supporting_quote": "The safety analysis set comprised all patients who received ≥1 full or partial dose of tebentafusp, durvalumab, or tremelimumab, with patients classified according to their assigned arm. The efficacy analysis set comprised patients assigned to treatment in Arms 1 (tebentafusp+durvalumab) and 3 (triplet therapy) and who received ≥1 full or partial dose of tebentafusp, durvalumab, or tremelimumab. Arm 2 (tebentafusp+tremelimumab) was excluded from efficacy analyses due to too few patients for meaningful analyses (n=13). Sensitivity analyses of patients in the efficacy analysis set who progressed on prior anti-PD(L)1 therapy were also conducted (sensitivity analysis set)."
      },
      {
        "id": "CE-22336573c3cce0e1e298eefb-span-293f12115951a30a96ad6f7e",
        "source_id": "report-fd929ab24db072096b604284:main:911f1760da5ab9f0",
        "block_id": "b00034",
        "supporting_quote": "<table-wrap position=\"float\" id=\"T1\" orientation=\"portrait\"><label>Table 1</label><caption><p>Baseline patient demographics and clinical characteristics</p></caption><table frame=\"hsides\" rules=\"groups\"><thead><tr><td align=\"left\" valign=\"bottom\" rowspan=\"1\" colspan=\"1\" /><td align=\"left\" valign=\"bottom\" rowspan=\"1\" colspan=\"1\">Arm 1: tebentafusp +durvalumab (N=43)</td><td align=\"left\" valign=\"bottom\" rowspan=\"1\" colspan=\"1\">Arm 2: tebentafusp +tremelimumab (N=13)</td><td align=\"left\" valign=\"bottom\" rowspan=\"1\" colspan=\"1\">Arm 3: tebentafusp +durvalumab +tremelimumab (N=29)</td><td align=\"left\" valign=\"bottom\" rowspan=\"1\" colspan=\"1\">All patients (N=85)</td><td align=\"left\" valign=\"bottom\" rowspan=\"1\" colspan=\"1\">Efficacy population*(N=72)</td><td align=\"left\" valign=\"bottom\" rowspan=\"1\" colspan=\"1\">Sensitivity population†(N=58)</td></tr></thead><tbody><tr><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">Median age (range), years</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">59 (28–79)</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">52 (30–74)</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">58 (30–79)</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">58 (28–79)</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">59 (28–79)</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">58 (29–79)</td></tr><tr><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"2\">ECOG performance status, n (%)</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\" /><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\" /><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\" /><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\" /><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\" /></tr><tr><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\"> 0</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">34 (79)</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">5 (38)</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">26 (90)</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">65 (76)</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">60 (83)</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">47 (81)</td></tr><tr><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\"> 1</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">9 (21)</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">8 (62)</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">3 (10)</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">20 (24)</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">12 (17)</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">11 (19)</td></tr><tr><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"2\">Lactate dehydrogenase, n (%)</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\" /><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\" /><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\" /><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\" /><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\" /></tr><tr><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\"> ≤ULN</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">16 (37)</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">5 (38)</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">13 (45)</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">34 (40)</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">29 (40)</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">24 (41)</td></tr><tr><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\"> &gt;ULN</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">18 (42)</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">3 (23)</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">11 (38)</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">32 (38)</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">29 (40)</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">23 (40)</td></tr><tr><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\"> Missing</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">9 (21)</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">5 (38)</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">5 (17)</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">19 (22)</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">14 (19)</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">11 (19)</td></tr><tr><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">BRAFm, n (%)</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">19 (44)</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">6 (46)</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">8 (28)</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">33 (39)</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">27 (38)</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">22 (38)</td></tr><tr><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\"> BRAFm pts who received inhibitors</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">13 (68)</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">6 (100)</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">6 (75)</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">25 (76)</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">19 (70)</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">16 (73)</td></tr><tr><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"2\">Prior lines of metastatic therapy, n (%)</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\" /><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\" /><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\" /><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\" /><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\" /></tr><tr><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\"> 1L</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">11 (26)</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">1 (8)</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">5 (17)</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">17 (20)</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">16 (22)</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">10 (17)</td></tr><tr><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\"> 2L</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">9 (21)</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">1 (8)</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">7 (24)</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">17 (20)</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">16 (22)</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">16 (28)</td></tr><tr><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\"> 3L</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">5 (12)</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">5 (38)</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">8 (28)</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">18 (21)</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">13 (18)</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">12 (21)</td></tr><tr><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\"> 4L+</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">13 (30)</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">6 (46)</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">6 (21)</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">25 (30)</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">19 (26)</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">18 (31)</td></tr><tr><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"2\">Prior immunotherapy</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\" /><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\" /><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\" /><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\" /><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\" /></tr><tr><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"2\"> Checkpoint inhibitors</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\" /><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\" /><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\" /><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\" /><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\" /></tr><tr><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\"> Anti-PD(L)1</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">36 (84)</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">13 (100)</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">27 (93)</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">76 (89)</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">63 (88)</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">58 (100)</td></tr><tr><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\"> Anti-CTLA4</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">32 (74)</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">13 (100)</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">19 (66)</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">64 (75)</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">51 (71)</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">44 (76)</td></tr><tr><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\"> TIL therapy</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">1 (2)</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">2 (15)</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">3 (10)</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">6 (7)</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">4 (6)</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">4 (7)</td></tr><tr><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\"> Tebentafusp</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">0</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">0</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">1 (3)</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">1 (1)</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">1 (1)</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">1 (2)</td></tr><tr><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\"> Other</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">18 (42)</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">3 (23)</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">8 (28)</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">29 (34)</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">26 (36)</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">22 (38)</td></tr><tr><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"2\">BOR to prior anti-PD(L)1 therapy, n (%)</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\" /><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\" /><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\" /><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\" /><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\" /></tr><tr><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\"> CR/PR/SD (ie, relapsed)</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">21 (46)</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">10 (77)</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">16 (55)</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">47 (55)</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">37 (51)</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">34 (59)</td></tr><tr><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\"> PD (ie, refractory)</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">11 (26)</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">3 (23)</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">10 (34)</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">24 (28)</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">21 (29)</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">19 (33)</td></tr><tr><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\"> Missing</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">4 (9)</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">0</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">1 (3)</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">5 (6)</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">5 (7)</td><td align=\"left\" valign=\"top\" rowspan=\"1\" colspan=\"1\">5 (9)</td></tr></tbody></table><table-wrap-foot><fn id=\"T1_FN1\"><p>*The efficacy analysis population consists of patients treated with tebentafusp and durvalumab±tremelimumab (Arms 1 and 3).</p></fn><fn id=\"T1_FN2\"><p>†The sensitivity analysis population consists of patients treated with tebentafusp and durvalumab±tremelimumab who discontinued prior anti-PD(L)1 due to disease progression.</p></fn><fn id=\"T1_FN3\"><p>BOR, best overall response; BRAFm, BRAF mutation; CR, complete response; CTLA4, cytotoxic T-lymphocyte-associated antigen 4; ECOG, Eastern Cooperative Oncology Group; 1L, first line; 2L, second line; 3L, third line; 4L+, fourth line and beyond; PD, progressive disease; PD(L)1, programmed death (ligand) 1; PD(L)1, programmed death (ligand) 1; PR, partial response; SD, stable disease; TIL, tumor infiltrating lymphocyte; ULN, upper limit of normal.</p></fn></table-wrap-foot></table-wrap>"
      },
      {
        "id": "CE-22336573c3cce0e1e298eefb-span-31c496c59986fc76b4f5a70c",
        "source_id": "report-fd929ab24db072096b604284:main:911f1760da5ab9f0",
        "block_id": "b00033",
        "supporting_quote": "All patients enrolled, N=85, received at least one dose of study treatment and contributed to the safety analysis. This included 43 patients who were assigned to receive tebentafusp+durvalumab (Arm 1), 13 assigned to receive tebentafusp+tremelimumab (Arm 2), and 29 assigned to receive triplet therapy (Arm 3). Among patients enrolled, 81 (95%) had CM and 4 (5%) had mucosal melanoma. The median age was 58 (range 28–79), 76% were ECOG 0, and 38% had baseline lactate dehydrogenase (LDH) above the upper limit of normal (ULN) ( table 1 ). Thirty-three (39%) patients had mutated BRAF, of whom 30 had BRAFV600 mutations and 25 had received prior BRAF/MEK inhibitors (7 single agents and 18 combinations). The median number of prior metastatic lines of therapy was 3 (range 1–4) with nearly all patients (76/85 (89%)) receiving prior anti-PD(L)1 therapy; of whom 80% also received prior ipilimumab. Of the 72 patients who were assigned to receive tebentafusp and durvalumab±tremelimumab (Arms 1 and 3), 63 received prior anti-PD(L)1 therapy, of which 58 were reported as having discontinued prior anti-PD(L)1 therapy due to disease progression. Thirty-four of these 58 patients (59%) were documented as relapsed (best overall response (BOR)=stable disease (SD)/partial response (PR)/complete response (CR)) and 19/58 (33%) as primary refractory (BOR=PD) to prior anti-PD(L)1 therapy."
      }
    ],
    "reason": "All 85 enrolled patients received at least one dose. Efficacy includes every treated patient in Arms 1 and 3; only Arm 2 was excluded. Thus the arm-specific overall and efficacy populations are identical (Arm 1: 43; Arm 3: 29)."
  },
  {
    "id": "reviewed-33955714:1:2",
    "pmid": "33955714",
    "samples": [
      "448"
    ],
    "contexts": [
      {
        "stage": "R3",
        "source": "3dc5117f25b776dc30721868c48f7727b0248e09c7a8cfd97544fddbb2680226",
        "binding": "9e6ea79060f7acfcbb55a25a01073fa1eece852dbd87dca0f6d464522954c30c",
        "population": "p1",
        "comparator": null,
        "intervention": "a1"
      },
      {
        "stage": "R3",
        "source": "3dc5117f25b776dc30721868c48f7727b0248e09c7a8cfd97544fddbb2680226",
        "binding": "9e6ea79060f7acfcbb55a25a01073fa1eece852dbd87dca0f6d464522954c30c",
        "population": "p3",
        "comparator": null,
        "intervention": "a2"
      }
    ],
    "preferred_context": 0,
    "evidence": [
      {
        "id": "CE-9e6ea79060f7acfcbb55a25a-span-7de045d1d665e36d1c630838",
        "source_id": "report-082a9b223f8e08c2111d3790:main:2355caa6851e9719",
        "block_id": "b00013",
        "supporting_quote": "E–R relationships for nivolumab efficacy were evaluated using data from patients receiving postsurgical adjuvant treatment of melanoma with a dosing regimen of 3 mg/kg q2w in CheckMate 238. 8 Nivolumab exposure data were available for 448/452 patients treated with nivolumab."
      },
      {
        "id": "CE-9e6ea79060f7acfcbb55a25a-span-df4a6b400adbd6cbb8311529",
        "source_id": "report-082a9b223f8e08c2111d3790:main:2355caa6851e9719",
        "block_id": "b00038",
        "supporting_quote": "Of 448 nivolumab‐treated patients in CheckMate 238 included in the E–R analyses of efficacy, 169 (37.7%) experienced an RFS event (recurrence or death) and 151 (33.7%) experienced a DMFS event (distant metastasis or death)."
      },
      {
        "id": "CE-9e6ea79060f7acfcbb55a25a-span-20a8e685d66868ec7cc61976",
        "source_id": "report-082a9b223f8e08c2111d3790:main:2355caa6851e9719",
        "block_id": "b00014",
        "supporting_quote": "E–R relationships for nivolumab safety were evaluated using pooled data from 3008 patients from 14 studies, of whom 448 were patients from CheckMate 238 with melanoma treated in the adjuvant setting. The remaining 2560 patients had advanced solid tumors, including melanoma, renal cell carcinoma, squamous/nonsquamous non‐small cell lung cancer, squamous cell carcinoma of the head and neck, classical Hodgkin lymphoma, urothelial carcinoma, and others. Patients received nivolumab doses of 1–10 mg/kg q2w or q3w, as previously described in E–R safety analyses. 11"
      },
      {
        "id": "CE-9e6ea79060f7acfcbb55a25a-span-bae949c9aa9aab247b235fbb",
        "source_id": "report-082a9b223f8e08c2111d3790:main:2355caa6851e9719",
        "block_id": "b00045",
        "supporting_quote": "Of the 448 nivolumab‐treated patients in CheckMate 238 included in E–R safety analyses, 137 (30.5%) experienced at least one grade 3+ AE, and 146 (32.5%) experienced a grade 2+ IMAE. The incidence of grade 3+ AEs in adjuvant melanoma was lower than that observed in the combined incidence of other tumor types included in the analysis (59.6%). However, the incidence of grade 2+ IMAEs was similar to those observed in other tumor types (29.6%)."
      }
    ],
    "reason": "Both analyses use the 448 CheckMate 238 nivolumab-treated patients with exposure data, among 452 treated patients. The safety analysis includes these same 448 in a larger cross-tumor pool; only the melanoma subset is aliased."
  },
  {
    "id": "reviewed-28283736:5:7",
    "pmid": "28283736",
    "samples": [
      "8"
    ],
    "contexts": [
      {
        "stage": "R3",
        "source": "46374582b30b52751a1c8a9a8173b3eea638a561e9219d52f5c51bdde96f24f4",
        "binding": "0dbc4f9d77134c26c6ac699f9c67196c286e2208898e0465da75a6802a301afe",
        "population": "p6",
        "comparator": null,
        "intervention": "a1"
      },
      {
        "stage": "R3",
        "source": "46374582b30b52751a1c8a9a8173b3eea638a561e9219d52f5c51bdde96f24f4",
        "binding": "0dbc4f9d77134c26c6ac699f9c67196c286e2208898e0465da75a6802a301afe",
        "population": "p3",
        "comparator": null,
        "intervention": "a1"
      }
    ],
    "preferred_context": 1,
    "evidence": [
      {
        "id": "CE-0dbc4f9d77134c26c6ac699f-span-19a4e4a2ce4766fe86dfa8cc",
        "source_id": "report-b6eb396e82cccc8a0be90003:main:25341e9a7d30a8d1",
        "block_id": "b00026",
        "supporting_quote": "Among the 42 enrolled patients, 37 were evaluable for the tumor response performed by central review. Five patients without measurable lesions at baseline according to central review were excluded from the analysis. Of the 37 patients, 29 had cutaneous melanoma (primary efficacy evaluation population) and 8 had mucosal melanoma. The tumor response results per RECIST v1.1 are summarized in Table 3 and Fig. 1 . A waterfall plot shows that 75.7% (28/37) of the patients experienced some degree of tumor shrinkage. The confirmed ORR, as assessed by central review, was 24.1% for the patients with cutaneous melanoma (7/29; 95% CI 10.3–43.5), and the lower limit of the 95% CI exceeded the 10% threshold response rate ( P = 0.0216). The median time to response was 12.3 weeks among the patients with cutaneous melanoma. The responses were durable, and the median DOR was not reached; 5 (71.4%) of the 7 responders with cutaneous melanoma remained progression-free. The confirmed ORR, as assessed by central review, was 25.0% for the patients with mucosal melanoma (2/8; 95% CI 3.2–65.1). The median time to response was 17.8 weeks among the patients with mucosal melanoma. The median DOR was not reached, and 2 (100%) of the 2 responders with mucosal melanoma remained progression-free. Similar tumor response results were obtained by investigator review (Table 3 ). Kaplan–Meier curves of PFS per RECIST v1.1 by central review and OS are shown in Fig. 2 . The median PFS as assessed by central review was 4.2 months (95% CI 2.8–7.0) for the patients with cutaneous melanoma, with a 6-month PFS rate of 41.4%. The median PFS was 3.4 months (95% CI 2.1–NA) for the patients with mucosal melanoma, with a 6-month PFS rate of 37.5%. The median OS was not reached in either population, with a 12-month OS rate of 82.7% for the patients with cutaneous melanoma and 51.4% for the patients with mucosal melanoma."
      },
      {
        "id": "CE-0dbc4f9d77134c26c6ac699f-span-421e3329ddb915d4083a9780",
        "source_id": "report-b6eb396e82cccc8a0be90003:main:25341e9a7d30a8d1",
        "block_id": "b00027",
        "supporting_quote": "Table 3 Tumor response in patients with advanced melanoma treated with pembrolizumab Cutaneous melanoma n (%; 95% CI) Mucosal melanoma n (%; 95% CI) Total n (%; 95% CI) Central review ( n = 29) ( n = 8) ( n = 37) Overall response 7 (24.1%, 10.3–43.5) 2 (25.0%, 3.2–65.1) 9 (24.3%, 11.8–41.2) Complete response 2 (6.9%, 0.8–22.8) 0 2 (5.4%, 0.7–18.2) Partial response 5 (17.2%, 5.8–35.8) 2 (25.0%, 3.2–65.1) 7 (18.9%, 8.0–35.2) Stable disease 7 (24.1%, 10.3–43.5) 2 (25.0%, 3.2–65.1) 9 (24.3%, 11.8–41.2) Progressive disease 14 (48.3%, 29.4–67.5) 4 (50.0%, 15.7–84.3) 18 (48.6%, 31.9–65.6) Non-evaluable 1 (3.4%, 0.1–17.8) 0 1(2.7%, 0.1–14.2) Investigator review ( n = 34) ( n = 8) ( n = 42) Overall response 9 (26.5%, 12.9–44.4) 3 (37.5%, 8.5–75.5) 12 (28.6%, 15.7–44.6) Complete response 2 (5.9%, 0.7–19.7) 0 2 (4.8%, 0.6–16.2) Partial response 7 (20.6%, 8.7–37.9) 3 (37.5%, 8.5–75.5) 10 (23.8%, 12.1–39.5) Stable disease 14 (41.2%, 24.6–59.3) 2 (25.0%, 3.2–65.1) 16 (38.1%, 23.6–54.4) Progressive disease 11 (32.4%, 17.4–50.5) 3 (37.5%, 8.5–75.5) 14 (33.3%, 19.6–49.5) Median time to response, weeks (range) 12.3 (12–18) 17.8 (12–24) 12.3 (12–24) Median duration of response, weeks (range) NR (17 to 37+) NR (24+ to 36+) NR (17 to 37+) NR not reached"
      },
      {
        "id": "CE-0dbc4f9d77134c26c6ac699f-span-e144758b7b3e757f5046851f",
        "source_id": "report-b6eb396e82cccc8a0be90003:main:25341e9a7d30a8d1",
        "block_id": "b00020",
        "supporting_quote": "Between July 2014 and March 2015, a total of 42 Japanese patients with advanced melanoma were enrolled in this study at 12 study sites in Japan and were treated with pembrolizumab (2 mg/kg Q3W). At the time of data cutoff (August 20, 2015), the median duration of follow-up was 10.3 months (range 2.6–12.6 months). The baseline characteristics of the patients are summarized in Table 1 . The patients had a median age of 65 years (range 39–89 years), 61.9% were male, 81.0% had an ECOG performance status of 0, and 59.6% had not received any prior systemic therapy for advanced melanoma. A primary cutaneous histology was observed in 34 patients (81.0%), while a primary mucosal histology was observed in 8 patients (19.0%). The most frequent subtypes of melanoma were acral lentiginous melanoma (ALM: 12/42, 28.6%) and nodular melanoma (10/42, 23.8%). The BRAF V600 mutation was observed in 16.7% of the patients, and 50% had PD-L1-positive tissue samples. The median duration of treatment was 212.5 days (range 1.0–385.0 days), and the median number of treatments was 11.0 (range, 1.0–19.0). At the time of the analysis, 21 patients had discontinued pembrolizumab treatment: 5 because of an AE, 3 because of clinical progression, and 13 because of disease progression."
      }
    ],
    "reason": "All eight treated mucosal melanoma patients were centrally evaluable; all five patients omitted from central review were cutaneous. Central and investigator outcomes remain distinct (ORR 25% versus 37.5%) despite the same patients."
  },
  {
    "id": "reviewed-39207855:1:3",
    "pmid": "39207855",
    "samples": [
      "106"
    ],
    "contexts": [
      {
        "stage": "R2",
        "source": "94186ab091fb1ae853197a48d59e8fa6f5a223572f479fd9c61d761367f211b5",
        "binding": "8c4e3553e6da0e80b28b9dcf01409646b4872311e57818e5b42d3332c092ba93",
        "population": "p2",
        "comparator": null,
        "intervention": "a1"
      },
      {
        "stage": "R3",
        "source": "d251af5f6fb90e9328514dbf43e96d0b641c7e187b72fa3883e2f9c8de740fca",
        "binding": "e2d84548cff4faeeb0d525d18278acbdd55517e6f60ebc3a98fe8eba51daebd3",
        "population": "p2",
        "comparator": null,
        "intervention": "r3a1"
      }
    ],
    "preferred_context": 1,
    "evidence": [
      {
        "id": "CE-8c4e3553e6da0e80b28b9dcf-span-91e7ac24a0c5dfe932a6de26",
        "source_id": "report-11d373954ae4d8dddcb6f449:citation",
        "block_id": "abstract",
        "supporting_quote": "Melanoma is the deadliest form of skin cancer. The median age at diagnosis is 66. While most patients are treated with immunotherapy, the use of targeted therapy is a valid alternative for patients whose tumors harbor a BRAF or c-KIT driver mutation. These agents, while effective, come with a variety of side effects which limit their use, especially in older patients. We sought to assess the efficacy and toxicity of these agents in older melanoma patients. Melanoma patients over 65 treated with BRAF/MEK or c-KIT inhibitors were retrospectively identified, and their data were analyzed for treatment efficacy and toxicity. All data were compared using the Chi-square test for categorical comparisons and the Kruskal-Wallis method for median comparisons. One hundred and sixteen patients were identified. One hundred and six patients were treated with BRAF/MEK inhibitors. The assessed response rate (RR) was 83% and was comparable across different subgroups, including advanced line patients and those with a more aggressive disease. The median progression free survival (PFS) was 7.9 months, and the median overall survival (OS) was 15.7 months. Twenty-seven percent experienced grade 3-4 toxicity leading to a 24% treatment discontinuation rate. Another 10 patients were treated with the c-KIT inhibitor imatinib, for whom the assessed RR was 55%. The median PFS was 4.3 months, and the median OS was 22.6 months. Forty percent needed dose reductions, yet none had to stop treatment due to adverse effects. The use of targeted therapy in older patients is effective yet challenging due to toxicity. Deploying mitigation strategies can help maximizing their usefulness."
      },
      {
        "id": "CE-e2d84548cff4faeeb0d525d1-span-6bb3eef40b48a8711ae9d5ea",
        "source_id": "report-11d373954ae4d8dddcb6f449:main:ca78262d65834740",
        "block_id": "b00020",
        "supporting_quote": "A total of 116 patients over age 65 treated with targeted therapy were identified. These were further divided into two cohorts: 106 patients in the BRAF mutated cohort and 10 other patients in the c-KIT mutated cohort. A flow chart showing the patient selection process is shown in Fig. 1 ."
      },
      {
        "id": "CE-e2d84548cff4faeeb0d525d1-span-0fa8c4a04819e6d0309e5c47",
        "source_id": "report-11d373954ae4d8dddcb6f449:main:ca78262d65834740",
        "block_id": "b00023",
        "supporting_quote": "One hundred and six BRAF mutated advanced melanoma patients were identified. BRAF mutation status was obtained using next generation sequencing (NGS) in all patients, and 99% had a documented BRAF V600E/K mutation (with the remaining one patient having an Exon 11 mutation). The median age was 71 (65–89) and 55% were males. The median follow-up was 28.9 months (1–124). Baseline patient characteristics are depicted in Table 1 ."
      },
      {
        "id": "CE-e2d84548cff4faeeb0d525d1-span-3872822de2653b3f80e050e7",
        "source_id": "report-11d373954ae4d8dddcb6f449:main:ca78262d65834740",
        "block_id": "b00024",
        "supporting_quote": "Table 1\nBaseline patient characteristics – BRAF cohort\nCharacteristic | N (%)\nSex | \nMale | 59 (55%)\nFemale | 47 (45%)\nTreatment line | \n1 st | 32 (30%)\n2 nd | 58 (55%)\n3 rd | 16 (15%)\nDisease stage | \nIII or IV NED | 22 (21%)\nIV | 84 (79%)\nECOG performance status | \n0–1 | 67 (63%)\n2–3 | 12 (11%)\nUnknown | 27 (26%)\nLDH at treatment initiation | \nWNL | 76 (72%)\n<X2 WNL | 20 (19%)\n>X2 WNL | 10 (9%)\nAgent used | \nDabrafenib + trametinib | 61 (57%)\nEncorafenib + binimetinib | 37 (35%)\nVemurafenib + cobimetinib | 2 (2%)\nSingle agent BRAF inhibitor | 2 (2%)\nCombination BRAF/MEK + anti PD-1/PDL-1 | 4 (4%)\nCNS metastases at treatment initiation | \nYes | 37 (35%)\nNo | 69 (65%)\nMelanoma subtype | \nCutaneous | 75 (71%)\nAcral | 7 (7%)\nUnknown | 23 (22%)\nUveal | 1 (<1%)\nComorbidities of interest | \nAutoimmune disorders | 20 (19%)\nType II diabetes | 18 (17%)\nIschemic heart disease | 12 (11%)\nAtrial fibrillation | 17 (16%)\nSolid organ transplant recipient | 3 (3%)\nECOG, Eastern Cooperative Oncology Group; LDH, lactate dehydrogenase; N/A, not applicable; NED, no evidence of disease; WNL, within normal limits."
      },
      {
        "id": "CE-e2d84548cff4faeeb0d525d1-span-0299f35c5964337bfa3f7950",
        "source_id": "report-11d373954ae4d8dddcb6f449:main:ca78262d65834740",
        "block_id": "b00028",
        "supporting_quote": "The most common treatment regimen was dabrafenib and trametinib which was used in 57% of all patients (44% for metastatic/unresectable disease and 13% as adjuvant treatment), followed by the combination of encorafenib and binimetinib that was used in 35%. Only 2% were treated with vemurafenib + cobimetinib and another 2% were treated with a single agent BRAF inhibitor. RRs were similar for dabrafenib and trametinib and encorafenib and binimetinib with 83 and 85%, respectively. Four patients were treated with a combination of both targeted therapy and an anti PD-1 agent with all of them achieving a response (3 PR and 1 CR)."
      }
    ],
    "reason": "The full-text BRAF cohort contains the same106 participants. Table1 lists61 dabrafenib/trametinib,37 encorafenib/binimetinib,2 vemurafenib/cobimetinib,2 single-agent BRAF inhibitor and4 BRAF/MEK plus anti-PD-1/PD-L1. The specific OR-of-regimens belongs to the whole106 cohort.",
    "treatment_preferences": {
      "intervention": {
        "context": 1,
        "reason": "Table 1 identifies the named alternatives within the same 106-person BRAF-mutated cohort: BRAF/MEK combinations, single-agent BRAF inhibition, and BRAF/MEK plus anti-PD-1/PD-L1. The full-text aggregate preserves these alternatives; it excludes the separate KIT cohort.",
        "evidence": [
          {
            "id": "CE-e2d84548cff4faeeb0d525d1-span-3872822de2653b3f80e050e7",
            "source_id": "report-11d373954ae4d8dddcb6f449:main:ca78262d65834740",
            "block_id": "b00024",
            "supporting_quote": "Table 1\nBaseline patient characteristics – BRAF cohort\nCharacteristic | N (%)\nSex | \nMale | 59 (55%)\nFemale | 47 (45%)\nTreatment line | \n1 st | 32 (30%)\n2 nd | 58 (55%)\n3 rd | 16 (15%)\nDisease stage | \nIII or IV NED | 22 (21%)\nIV | 84 (79%)\nECOG performance status | \n0–1 | 67 (63%)\n2–3 | 12 (11%)\nUnknown | 27 (26%)\nLDH at treatment initiation | \nWNL | 76 (72%)\n<X2 WNL | 20 (19%)\n>X2 WNL | 10 (9%)\nAgent used | \nDabrafenib + trametinib | 61 (57%)\nEncorafenib + binimetinib | 37 (35%)\nVemurafenib + cobimetinib | 2 (2%)\nSingle agent BRAF inhibitor | 2 (2%)\nCombination BRAF/MEK + anti PD-1/PDL-1 | 4 (4%)\nCNS metastases at treatment initiation | \nYes | 37 (35%)\nNo | 69 (65%)\nMelanoma subtype | \nCutaneous | 75 (71%)\nAcral | 7 (7%)\nUnknown | 23 (22%)\nUveal | 1 (<1%)\nComorbidities of interest | \nAutoimmune disorders | 20 (19%)\nType II diabetes | 18 (17%)\nIschemic heart disease | 12 (11%)\nAtrial fibrillation | 17 (16%)\nSolid organ transplant recipient | 3 (3%)\nECOG, Eastern Cooperative Oncology Group; LDH, lactate dehydrogenase; N/A, not applicable; NED, no evidence of disease; WNL, within normal limits."
          },
          {
            "id": "CE-e2d84548cff4faeeb0d525d1-span-0299f35c5964337bfa3f7950",
            "source_id": "report-11d373954ae4d8dddcb6f449:main:ca78262d65834740",
            "block_id": "b00028",
            "supporting_quote": "The most common treatment regimen was dabrafenib and trametinib which was used in 57% of all patients (44% for metastatic/unresectable disease and 13% as adjuvant treatment), followed by the combination of encorafenib and binimetinib that was used in 35%. Only 2% were treated with vemurafenib + cobimetinib and another 2% were treated with a single agent BRAF inhibitor. RRs were similar for dabrafenib and trametinib and encorafenib and binimetinib with 83 and 85%, respectively. Four patients were treated with a combination of both targeted therapy and an anti PD-1 agent with all of them achieving a response (3 PR and 1 CR)."
          }
        ]
      }
    }
  },
  {
    "id": "reviewed-34887574:1:2",
    "pmid": "34887574",
    "samples": [
      "30"
    ],
    "contexts": [
      {
        "stage": "R2",
        "source": "c4a8cdd8cf744ba52290b8d4f95643dfc47d64f2131e6450989e651848e7afb3",
        "binding": "c6017c8e56bee7a8abb806c1c02cdac4ee5054f51fd382d8561d91b076b908b6",
        "population": "p1",
        "comparator": null,
        "intervention": "a1"
      },
      {
        "stage": "R3",
        "source": "29f17f6351903897afd9d86fb6ff13fb75667073012df0477a14401172f5ce8e",
        "binding": "17dd226857b65529875edd8e3cec0c0c106b93cf40d00a7164a0179845e59bbf",
        "population": "p1",
        "comparator": null,
        "intervention": "a1"
      }
    ],
    "preferred_context": 1,
    "evidence": [
      {
        "id": "CE-c6017c8e56bee7a8abb806c1-span-0e65e9b7b1c17e1d5ccc7274",
        "source_id": "report-ec844a09ef9f853092e2da77:citation",
        "block_id": "abstract",
        "supporting_quote": "Anti-programmed death (PD)-1 (aPD1) therapy is an effective treatment for metastatic melanoma (MM); however, over 50% of patients progress due to resistance. We tested a first-in-class immune-modulatory vaccine (IO102/IO103) against indoleamine 2,3-dioxygenase (IDO) and PD ligand 1 (PD-L1), targeting immunosuppressive cells and tumor cells expressing IDO and/or PD-L1 (IDO/PD-L1), combined with nivolumab. Thirty aPD1 therapy-naive patients with MM were treated in a phase 1/2 study ( https://clinicaltrials.gov/ , NCT03047928). The primary endpoint was feasibility and safety; the systemic toxicity profile was comparable to that of nivolumab monotherapy. Secondary endpoints were efficacy and immunogenicity; an objective response rate (ORR) of 80% (confidence interval (CI), 62.7-90.5%) was reached, with 43% (CI, 27.4-60.8%) complete responses. After a median follow-up of 22.9 months, the median progression-free survival (PFS) was 26 months (CI, 15.4-69 months). Median overall survival (OS) was not reached. Vaccine-specific responses assessed in vitro were detected in the blood of >93% of patients during vaccination. Vaccine-reactive T cells comprised CD4+ and CD8+ T cells with activity against IDO- and PD-L1-expressing cancer and immune cells. T cell influx of peripherally expanded T cells into tumor sites was observed in responding patients, and general enrichment of IDO- and PD-L1-specific clones after treatment was documented. These clinical efficacy and favorable safety data support further validation in a larger randomized trial to confirm the clinical potential of this immunomodulating approach."
      },
      {
        "id": "CE-17dd226857b65529875edd8e-span-12ee84bf2b049fc7aaf5895c",
        "source_id": "report-ec844a09ef9f853092e2da77:main:e2e772b9bcbc2cd9",
        "block_id": "b00007",
        "supporting_quote": "In this phase 1/2 clinical trial, MM1636, patients with MM received a combination of the IDO/PD-L1 (IO102/IO103) peptide vaccine with the adjuvant Montanide and the aPD1 antibody nivolumab. Patients were included in three cohorts: 30 aPD1 therapy-naive patients (cohort A), ten aPD1 therapy-refractory patients (cohort B, de novo resistance) and ten patients who progressed after aPD1 therapy (cohort C, acquired resistance). Here, we report results from cohort A."
      },
      {
        "id": "CE-17dd226857b65529875edd8e-span-ead1b3e9bf96c613c8b0ae39",
        "source_id": "report-ec844a09ef9f853092e2da77:main:e2e772b9bcbc2cd9",
        "block_id": "b00012",
        "supporting_quote": "Thirty patients were enrolled from December 2017 to June 2020. None of the 30 patients dropped out of the study; all received at least three cycles of therapy (Supplementary Fig. 1 ). At the current database lock (5 October 2020), six patients were still on treatment in the trial."
      },
      {
        "id": "CE-17dd226857b65529875edd8e-span-d5607d912af7b8d7292df8c5",
        "source_id": "report-ec844a09ef9f853092e2da77:main:e2e772b9bcbc2cd9",
        "block_id": "b00083",
        "supporting_quote": "Patients above 18 years of age with locally advanced or stage 4 melanoma according to the AJCC (seventh edition), at least one measurable lesion according to RECIST 1.1 and an ECOG PS of 0–1 were eligible. The main exclusion criteria were prior treatment with aPD1 therapy, CNS metastases >1 cm, severe comorbidities and active autoimmune disease. Enrollment was not restricted to PD-L1 status, but it was known before inclusion. Patients were included after informed consent."
      },
      {
        "id": "CE-17dd226857b65529875edd8e-span-e3ea164e14820e54560afdc4",
        "source_id": "report-ec844a09ef9f853092e2da77:main:e2e772b9bcbc2cd9",
        "block_id": "b00079",
        "supporting_quote": "The IDO/PD-L1 vaccine was administered subcutaneously biweekly for the first 10 weeks and thereafter every 4 weeks for approximately 9 months. A maximum of 15 vaccines were administered. Nivolumab was administered according to the approved label (3 mg per kg biweekly) for 24 cycles. The 15th vaccine was administered together with the 24th nivolumab cycle of 3 mg per kg, and responding patients thereafter continued nivolumab monotherapy every 4th week (6 mg per kg) as a standard of care after investigator assessment. Treatment with nivolumab was discontinued at the maximum benefit (assessed by the investigator), after a maximum of 2 years of therapy, at progression or due to severe adverse events (Extended Data Fig. 1b , treatment plan)."
      },
      {
        "id": "CE-17dd226857b65529875edd8e-span-dc7e829b9fef7e0189855773",
        "source_id": "report-ec844a09ef9f853092e2da77:main:e2e772b9bcbc2cd9",
        "block_id": "b00081",
        "supporting_quote": "Each vaccine was composed of 100 µg IO102, a 21-amino-acid peptide (DTLLKALLEIASCLEKALQVF) from IDO, and 100 µg IO103, a 19-amino-acid peptide (FMTYWHLLNAFTVTVPKDL) from the signal peptide of PD-L1 (PolyPeptide Laboratories). Peptides were dissolved separately in 50 µl DMSO, filtered for sterility and frozen at −20 °C (NUNC CyroTubes CryoLine System Internal Thread, Sigma-Aldrich). At <24 h before administration, peptides were thawed. The PD-L1 peptide was diluted in 400 µl sterile water and, immediately before injection, mixed with the IDO peptide solution and 500 µl Montanide ISA-51 (SEPPIC) to achieve a total volume of 1 ml."
      },
      {
        "id": "CE-17dd226857b65529875edd8e-span-ac2e7878f00cd053df582d10",
        "source_id": "report-ec844a09ef9f853092e2da77:main:e2e772b9bcbc2cd9",
        "block_id": "b00172",
        "supporting_quote": "Extended Data Fig. 1 Mode of Action and treatment plan. a) Anticipated mechanism of action of the combination therapy of an IDO/PD-L1 derived peptide vaccine and nivolumab (anti-PD1). 1) The IDO/PD-L1 peptide vaccine is administered subcutaneously (s.c) and nivolumab is administered intravenous (IV). 2) The vaccines peptides are phagocytosed by an antigen presenting cell and presented to IDO and PD-L1 specific T cells, which are activated. 3) The activated T cells migrates to the tumor site where they attack both immune-suppressive cells and tumour cells expressing IDO and/or PD-L1 leading to cytokine production and a pro-inflammatory tumour microenvironment. 4/5) Enhanced tumour killing by both IDO/PD-L1 specific T cells and tumor specific cytotoxic T cells due to PD-1 blockade. Created with BioRender.com b) Treatment plan. After written informed content patients were screened. Before treatment start a baseline PET/CT scan was performed, baseline blood sample for research use and if assessable a baseline needle biopsy. Patients were treated with the IDO/PD-L1 peptide vaccine subcutaneously biweekly for the first 6 injections and thereafter every fourth week for a maximum of 15 vaccines. Nivolumab was administered in parallel biweekly (3mg/kg) up to 24 series. If patients needed subsequent nivolumab after ended vaccination regiment they were treated with 6 mg/kg every fourth week up to two years. Needle biopsy and delayed type hypersensitivity (DTH) was performed after 6 series of treatment if assessable. PET/CT scans was performed every third month."
      }
    ],
    "reason": "Both stages describe the same30 anti-PD-1-naive cohort-A patients. Full text specifies IO102 and IO103 peptides, Montanide injection adjuvant, nivolumab and subsequent nivolumab maintenance; other cohorts remain distinct.",
    "treatment_preferences": {
      "intervention": {
        "context": 1,
        "reason": "The same 30 anti-PD-1-naive cohort-A patients received IO102 and IO103 peptides with injected Montanide ISA-51 and nivolumab. Subsequent nivolumab is restricted to responding patients in the saved schedule. Montanide is an administered vaccine adjuvant, not an ex-vivo reagent.",
        "evidence": [
          {
            "id": "CE-17dd226857b65529875edd8e-span-12ee84bf2b049fc7aaf5895c",
            "source_id": "report-ec844a09ef9f853092e2da77:main:e2e772b9bcbc2cd9",
            "block_id": "b00007",
            "supporting_quote": "In this phase 1/2 clinical trial, MM1636, patients with MM received a combination of the IDO/PD-L1 (IO102/IO103) peptide vaccine with the adjuvant Montanide and the aPD1 antibody nivolumab. Patients were included in three cohorts: 30 aPD1 therapy-naive patients (cohort A), ten aPD1 therapy-refractory patients (cohort B, de novo resistance) and ten patients who progressed after aPD1 therapy (cohort C, acquired resistance). Here, we report results from cohort A."
          },
          {
            "id": "CE-17dd226857b65529875edd8e-span-e3ea164e14820e54560afdc4",
            "source_id": "report-ec844a09ef9f853092e2da77:main:e2e772b9bcbc2cd9",
            "block_id": "b00079",
            "supporting_quote": "The IDO/PD-L1 vaccine was administered subcutaneously biweekly for the first 10 weeks and thereafter every 4 weeks for approximately 9 months. A maximum of 15 vaccines were administered. Nivolumab was administered according to the approved label (3 mg per kg biweekly) for 24 cycles. The 15th vaccine was administered together with the 24th nivolumab cycle of 3 mg per kg, and responding patients thereafter continued nivolumab monotherapy every 4th week (6 mg per kg) as a standard of care after investigator assessment. Treatment with nivolumab was discontinued at the maximum benefit (assessed by the investigator), after a maximum of 2 years of therapy, at progression or due to severe adverse events (Extended Data Fig. 1b , treatment plan)."
          },
          {
            "id": "CE-17dd226857b65529875edd8e-span-dc7e829b9fef7e0189855773",
            "source_id": "report-ec844a09ef9f853092e2da77:main:e2e772b9bcbc2cd9",
            "block_id": "b00081",
            "supporting_quote": "Each vaccine was composed of 100 µg IO102, a 21-amino-acid peptide (DTLLKALLEIASCLEKALQVF) from IDO, and 100 µg IO103, a 19-amino-acid peptide (FMTYWHLLNAFTVTVPKDL) from the signal peptide of PD-L1 (PolyPeptide Laboratories). Peptides were dissolved separately in 50 µl DMSO, filtered for sterility and frozen at −20 °C (NUNC CyroTubes CryoLine System Internal Thread, Sigma-Aldrich). At <24 h before administration, peptides were thawed. The PD-L1 peptide was diluted in 400 µl sterile water and, immediately before injection, mixed with the IDO peptide solution and 500 µl Montanide ISA-51 (SEPPIC) to achieve a total volume of 1 ml."
          }
        ]
      }
    }
  },
  {
    "id": "reviewed-31406564:1:5",
    "pmid": "31406564",
    "samples": [
      "72"
    ],
    "contexts": [
      {
        "stage": "R2",
        "source": "ea590342175838f365b89abb609e65e13857e0d03cab004be38e6706d9f3a41a",
        "binding": "e4a9d3c16a54f68bbbec4c227dbe360752b29ef017977c42cfeb4ec148843b34",
        "population": "pop1",
        "comparator": null,
        "intervention": "arm1"
      },
      {
        "stage": "R3",
        "source": "c27a70ee703aa38dcf506d4a9d6b3ac722dc6f82d11e2822bddad9095a6a181c",
        "binding": "941475cc62799599dc41de15210d09f81547b0193984e5dc117dc6afbe5a4491",
        "population": "p-overall",
        "comparator": null,
        "intervention": "a-dcv"
      }
    ],
    "preferred_context": 1,
    "evidence": [
      {
        "id": "CE-e4a9d3c16a54f68bbbec4c22-span-be31c39d0a8f536986c93b2e",
        "source_id": "report-9de9bad63a05d808bce9e37f:citation",
        "block_id": "title",
        "supporting_quote": "Patient-specific dendritic cell vaccines with autologous tumor antigens in 72 patients with metastatic melanoma."
      },
      {
        "id": "CE-e4a9d3c16a54f68bbbec4c22-span-4429e2e0e768c0e4f56e0097",
        "source_id": "report-9de9bad63a05d808bce9e37f:citation",
        "block_id": "abstract",
        "supporting_quote": "AIM: Metastatic melanoma patients were treated with patient-specific vaccines consisting of autologous dendritic cells loaded with antigens from irradiated cells from short-term autologous tumor cell lines.\n"
      },
      {
        "id": "CE-e4a9d3c16a54f68bbbec4c22-span-bdb78e8b3f5ee48d15912309",
        "source_id": "report-9de9bad63a05d808bce9e37f:citation",
        "block_id": "abstract",
        "supporting_quote": "PATIENTS & METHODS: A total of 72 patients were enrolled in a single-arm Phase I/II (NCT00948480) trial or a randomized Phase II (NCT00436930).\n"
      },
      {
        "id": "CE-941475cc62799599dc41de15-span-5cb26188605a55be5e922402",
        "source_id": "report-9de9bad63a05d808bce9e37f:main:11a2def0ec4cf76b",
        "block_id": "b00090",
        "supporting_quote": "Summary points A total of 45 men and 27 women with metastatic melanoma were treated with patient-specific therapeutic vaccines during 2001–2011. The vaccines consisted of autologous dendritic cells loaded with antigens from irradiated autologous tumor cells from a short-term cell culture derived from one or more surgically resected metastases. Tumor sources were lymph nodes (n = 37), viscera (n = 20) and soft tissue (n = 15). The antigen-loaded dendritic cells were admixed with GM–CSF (500 µg) and injected subcutaneously weekly for 3 weeks and monthly for 5 months at weeks 8, 12, 16, 20 and 24. The average number of doses injected was 7.3 of a possible 8. Treatment was well tolerated, highest grade adverse event was 3 in five of 72 patients. Median survival was 49.4 months and 5-year survival rate was 46%. A total of 5-year survival rates based on cohorts defined at the time of vaccine treatment were, 72% for 18 patients who were stage 3 without measurable disease and 53% for 30 patients who were stage 4 without measurable disease. For the 24 patients who were stage 4 with measurable disease at the time of treatment, median survival was 18.5 months and 2-year survival rate was 46%."
      },
      {
        "id": "CE-941475cc62799599dc41de15-span-4e9dde5d72c17bd34e252ed8",
        "source_id": "report-9de9bad63a05d808bce9e37f:main:11a2def0ec4cf76b",
        "block_id": "b00045",
        "supporting_quote": "Median age was 52 years (range: 17–83 years), and was also 52 years in each of the Phase II trials. Table 4 shows the proportions of different characteristics for all 72 patients and for the cohorts whose most advanced stage of disease at the time of treatment were recurrent stage 3 (n = 18) without measurable disease, stage 4 without measurable disease (n = 30) or stage 4 with measurable disease per response evaluation criteria in solid tumors (RECIST; n = 24). A patient’s most advanced stage of disease was considered to be recurrent stage 3 (n = 18) even if they had detectable or equivocal radiographic findings of distant metastatic disease if they had not been confirmed histologically (n = 3). The median time from tumor collection to enrollment for treatment was 7.1 months, and the median time from tumor collection to efforts to initiate a cell culture was 4.0 months. A total of 29 patients had recurrent stage 3 at the time of tumor collection, but 11 (38%) had experienced distant progression by the time of enrollment for treatment, and nine had measurable disease at that time. Of 33 patients with stage 4 disease at the time of tumor collection, 15 (45%) had recurred and had measurable disease at the time of treatment, while 18 (55%) had no evidence of disease at that time, often because of additional treatment procedures – including surgical resection of new metastases and stereotactic radiation for brain metastases. It is noteworthy that of the 54 patients, whose most advanced stage was stage 4, 14 (26%) had experienced brain metastases, and ten (19%) had experienced hepatic metastases."
      },
      {
        "id": "CE-941475cc62799599dc41de15-span-371de35784f4de0312bcdced",
        "source_id": "report-9de9bad63a05d808bce9e37f:main:11a2def0ec4cf76b",
        "block_id": "b00022",
        "supporting_quote": "Just prior to administration, DCV was rapidly thawed in a 37°C water bath. The thawed cell suspension was then rinsed in 10 ml of sterile AIM-V (antibiotic-free) medium in a 50 ml conical tube. A cell count was performed prior to centrifugation and decantation of the wash phase. The cell pellet was then suspended in 1 ml saline and 500 μg of GM–CSF in a 1.5 ml vial, and finally drawn into a 3.0 ml syringe for injection with a 25-gauge needle within 5 h of thawing."
      },
      {
        "id": "CE-941475cc62799599dc41de15-span-749ff822e0cdd50baf0aef70",
        "source_id": "report-9de9bad63a05d808bce9e37f:main:11a2def0ec4cf76b",
        "block_id": "b00024",
        "supporting_quote": "In both trials, each vaccine dose was injected subcutaneously in an extremity once a week for 3 weeks, and then once a month for 5 months at weeks 8, 12, 16, 20 and 24. The same extremity was not used for consecutive injections. Patients were monitored for toxicity, objective tumor response and progression free survival (PFS) and OS. Concurrent anticancer therapy was not allowed, but patients could interrupt vaccine therapy for specific interventions, then resume vaccine treatment."
      }
    ],
    "reason": "Both stages describe the same72 DCV-treated patients and the same18 recurrent-stage3,30 stage4 nonmeasurable and24 stage4 measurable subsets. Every vaccine dose was admixed with500 micrograms GM-CSF. Adding that component clarifies the existing regimen, not an additional cohort.",
    "treatment_preferences": {
      "intervention": {
        "context": 1,
        "reason": "Every autologous dendritic-cell vaccine injection was admixed with 500 micrograms of GM-CSF. This completes the administered regimen for the same cohort; the distinct stage and measurable-disease subsets remain separate.",
        "evidence": [
          {
            "id": "CE-941475cc62799599dc41de15-span-5cb26188605a55be5e922402",
            "source_id": "report-9de9bad63a05d808bce9e37f:main:11a2def0ec4cf76b",
            "block_id": "b00090",
            "supporting_quote": "Summary points A total of 45 men and 27 women with metastatic melanoma were treated with patient-specific therapeutic vaccines during 2001–2011. The vaccines consisted of autologous dendritic cells loaded with antigens from irradiated autologous tumor cells from a short-term cell culture derived from one or more surgically resected metastases. Tumor sources were lymph nodes (n = 37), viscera (n = 20) and soft tissue (n = 15). The antigen-loaded dendritic cells were admixed with GM–CSF (500 µg) and injected subcutaneously weekly for 3 weeks and monthly for 5 months at weeks 8, 12, 16, 20 and 24. The average number of doses injected was 7.3 of a possible 8. Treatment was well tolerated, highest grade adverse event was 3 in five of 72 patients. Median survival was 49.4 months and 5-year survival rate was 46%. A total of 5-year survival rates based on cohorts defined at the time of vaccine treatment were, 72% for 18 patients who were stage 3 without measurable disease and 53% for 30 patients who were stage 4 without measurable disease. For the 24 patients who were stage 4 with measurable disease at the time of treatment, median survival was 18.5 months and 2-year survival rate was 46%."
          },
          {
            "id": "CE-941475cc62799599dc41de15-span-371de35784f4de0312bcdced",
            "source_id": "report-9de9bad63a05d808bce9e37f:main:11a2def0ec4cf76b",
            "block_id": "b00022",
            "supporting_quote": "Just prior to administration, DCV was rapidly thawed in a 37°C water bath. The thawed cell suspension was then rinsed in 10 ml of sterile AIM-V (antibiotic-free) medium in a 50 ml conical tube. A cell count was performed prior to centrifugation and decantation of the wash phase. The cell pellet was then suspended in 1 ml saline and 500 μg of GM–CSF in a 1.5 ml vial, and finally drawn into a 3.0 ml syringe for injection with a 25-gauge needle within 5 h of thawing."
          },
          {
            "id": "CE-941475cc62799599dc41de15-span-749ff822e0cdd50baf0aef70",
            "source_id": "report-9de9bad63a05d808bce9e37f:main:11a2def0ec4cf76b",
            "block_id": "b00024",
            "supporting_quote": "In both trials, each vaccine dose was injected subcutaneously in an extremity once a week for 3 weeks, and then once a month for 5 months at weeks 8, 12, 16, 20 and 24. The same extremity was not used for consecutive injections. Patients were monitored for toxicity, objective tumor response and progression free survival (PFS) and OS. Concurrent anticancer therapy was not allowed, but patients could interrupt vaccine therapy for specific interventions, then resume vaccine treatment."
          }
        ]
      }
    }
  },
  {
    "id": "reviewed-31406564:2:6",
    "pmid": "31406564",
    "samples": [
      "18"
    ],
    "contexts": [
      {
        "stage": "R2",
        "source": "ea590342175838f365b89abb609e65e13857e0d03cab004be38e6706d9f3a41a",
        "binding": "e4a9d3c16a54f68bbbec4c227dbe360752b29ef017977c42cfeb4ec148843b34",
        "population": "pop2",
        "comparator": null,
        "intervention": "arm1"
      },
      {
        "stage": "R3",
        "source": "c27a70ee703aa38dcf506d4a9d6b3ac722dc6f82d11e2822bddad9095a6a181c",
        "binding": "941475cc62799599dc41de15210d09f81547b0193984e5dc117dc6afbe5a4491",
        "population": "p-rstage3",
        "comparator": null,
        "intervention": "a-dcv"
      }
    ],
    "preferred_context": 1,
    "evidence": [
      {
        "id": "CE-e4a9d3c16a54f68bbbec4c22-span-4ec645606e5edaa7fb1de41c",
        "source_id": "report-9de9bad63a05d808bce9e37f:citation",
        "block_id": "abstract",
        "supporting_quote": "RESULTS: Toxicity was minimal. Median overall survival (OS) was 49.4 months; 5-year OS 46%. A 5-year OS was 72% for 18 recurrent stage 3 without measurable disease when treated and 53% for 30 stage 4 without measurable disease when treated. A total of 24 patients with measurable stage 4 when treated (median of four prior therapies) had an 18.5 months median OS and 46% 2-year OS.\n"
      },
      {
        "id": "CE-e4a9d3c16a54f68bbbec4c22-span-4429e2e0e768c0e4f56e0097",
        "source_id": "report-9de9bad63a05d808bce9e37f:citation",
        "block_id": "abstract",
        "supporting_quote": "AIM: Metastatic melanoma patients were treated with patient-specific vaccines consisting of autologous dendritic cells loaded with antigens from irradiated cells from short-term autologous tumor cell lines.\n"
      },
      {
        "id": "CE-e4a9d3c16a54f68bbbec4c22-span-be31c39d0a8f536986c93b2e",
        "source_id": "report-9de9bad63a05d808bce9e37f:citation",
        "block_id": "title",
        "supporting_quote": "Patient-specific dendritic cell vaccines with autologous tumor antigens in 72 patients with metastatic melanoma."
      },
      {
        "id": "CE-941475cc62799599dc41de15-span-4e9dde5d72c17bd34e252ed8",
        "source_id": "report-9de9bad63a05d808bce9e37f:main:11a2def0ec4cf76b",
        "block_id": "b00045",
        "supporting_quote": "Median age was 52 years (range: 17–83 years), and was also 52 years in each of the Phase II trials. Table 4 shows the proportions of different characteristics for all 72 patients and for the cohorts whose most advanced stage of disease at the time of treatment were recurrent stage 3 (n = 18) without measurable disease, stage 4 without measurable disease (n = 30) or stage 4 with measurable disease per response evaluation criteria in solid tumors (RECIST; n = 24). A patient’s most advanced stage of disease was considered to be recurrent stage 3 (n = 18) even if they had detectable or equivocal radiographic findings of distant metastatic disease if they had not been confirmed histologically (n = 3). The median time from tumor collection to enrollment for treatment was 7.1 months, and the median time from tumor collection to efforts to initiate a cell culture was 4.0 months. A total of 29 patients had recurrent stage 3 at the time of tumor collection, but 11 (38%) had experienced distant progression by the time of enrollment for treatment, and nine had measurable disease at that time. Of 33 patients with stage 4 disease at the time of tumor collection, 15 (45%) had recurred and had measurable disease at the time of treatment, while 18 (55%) had no evidence of disease at that time, often because of additional treatment procedures – including surgical resection of new metastases and stereotactic radiation for brain metastases. It is noteworthy that of the 54 patients, whose most advanced stage was stage 4, 14 (26%) had experienced brain metastases, and ten (19%) had experienced hepatic metastases."
      },
      {
        "id": "CE-941475cc62799599dc41de15-span-c3b29542f8ebd5981db9cc2f",
        "source_id": "report-9de9bad63a05d808bce9e37f:main:11a2def0ec4cf76b",
        "block_id": "b00058",
        "supporting_quote": "The 5-year OS for the 18 patients whose most advanced stage was recurrent stage 3 was 72%. For the 54 patients whose most advanced stage was stage 4, the median OS was 42.5 months with 1-, 2-, 3-, 4- and 5-year survival rates of 83, 67, 57, 43 and 37%, respectively. However, this included patients who had measurable or nonmeasurable disease at the time of treatment. Figure 2 shows OS curves for patients based on the extent of disease at the time of treatment. Median OS was greater than 60 months for recurrent stage 3 (95% CI lower limit: 38.7 months; n = 18) and for nonmeasurable stage 4 (n = 30), compared with 18.5 months (95% CI: 12.6–42.7 months) for patients with measurable stage 4 disease (n = 24). The 3-year survival rates were 83, 73 and 38%, respectively."
      },
      {
        "id": "CE-941475cc62799599dc41de15-span-371de35784f4de0312bcdced",
        "source_id": "report-9de9bad63a05d808bce9e37f:main:11a2def0ec4cf76b",
        "block_id": "b00022",
        "supporting_quote": "Just prior to administration, DCV was rapidly thawed in a 37°C water bath. The thawed cell suspension was then rinsed in 10 ml of sterile AIM-V (antibiotic-free) medium in a 50 ml conical tube. A cell count was performed prior to centrifugation and decantation of the wash phase. The cell pellet was then suspended in 1 ml saline and 500 μg of GM–CSF in a 1.5 ml vial, and finally drawn into a 3.0 ml syringe for injection with a 25-gauge needle within 5 h of thawing."
      },
      {
        "id": "CE-941475cc62799599dc41de15-span-749ff822e0cdd50baf0aef70",
        "source_id": "report-9de9bad63a05d808bce9e37f:main:11a2def0ec4cf76b",
        "block_id": "b00024",
        "supporting_quote": "In both trials, each vaccine dose was injected subcutaneously in an extremity once a week for 3 weeks, and then once a month for 5 months at weeks 8, 12, 16, 20 and 24. The same extremity was not used for consecutive injections. Patients were monitored for toxicity, objective tumor response and progression free survival (PFS) and OS. Concurrent anticancer therapy was not allowed, but patients could interrupt vaccine therapy for specific interventions, then resume vaccine treatment."
      },
      {
        "id": "CE-941475cc62799599dc41de15-span-5cb26188605a55be5e922402",
        "source_id": "report-9de9bad63a05d808bce9e37f:main:11a2def0ec4cf76b",
        "block_id": "b00090",
        "supporting_quote": "Summary points A total of 45 men and 27 women with metastatic melanoma were treated with patient-specific therapeutic vaccines during 2001–2011. The vaccines consisted of autologous dendritic cells loaded with antigens from irradiated autologous tumor cells from a short-term cell culture derived from one or more surgically resected metastases. Tumor sources were lymph nodes (n = 37), viscera (n = 20) and soft tissue (n = 15). The antigen-loaded dendritic cells were admixed with GM–CSF (500 µg) and injected subcutaneously weekly for 3 weeks and monthly for 5 months at weeks 8, 12, 16, 20 and 24. The average number of doses injected was 7.3 of a possible 8. Treatment was well tolerated, highest grade adverse event was 3 in five of 72 patients. Median survival was 49.4 months and 5-year survival rate was 46%. A total of 5-year survival rates based on cohorts defined at the time of vaccine treatment were, 72% for 18 patients who were stage 3 without measurable disease and 53% for 30 patients who were stage 4 without measurable disease. For the 24 patients who were stage 4 with measurable disease at the time of treatment, median survival was 18.5 months and 2-year survival rate was 46%."
      }
    ],
    "reason": "Both stages describe the same72 DCV-treated patients and the same18 recurrent-stage3,30 stage4 nonmeasurable and24 stage4 measurable subsets. Every vaccine dose was admixed with500 micrograms GM-CSF. Adding that component clarifies the existing regimen, not an additional cohort.",
    "treatment_preferences": {
      "intervention": {
        "context": 1,
        "reason": "Every autologous dendritic-cell vaccine injection was admixed with 500 micrograms of GM-CSF. This completes the administered regimen for the same cohort; the distinct stage and measurable-disease subsets remain separate.",
        "evidence": [
          {
            "id": "CE-941475cc62799599dc41de15-span-371de35784f4de0312bcdced",
            "source_id": "report-9de9bad63a05d808bce9e37f:main:11a2def0ec4cf76b",
            "block_id": "b00022",
            "supporting_quote": "Just prior to administration, DCV was rapidly thawed in a 37°C water bath. The thawed cell suspension was then rinsed in 10 ml of sterile AIM-V (antibiotic-free) medium in a 50 ml conical tube. A cell count was performed prior to centrifugation and decantation of the wash phase. The cell pellet was then suspended in 1 ml saline and 500 μg of GM–CSF in a 1.5 ml vial, and finally drawn into a 3.0 ml syringe for injection with a 25-gauge needle within 5 h of thawing."
          },
          {
            "id": "CE-941475cc62799599dc41de15-span-749ff822e0cdd50baf0aef70",
            "source_id": "report-9de9bad63a05d808bce9e37f:main:11a2def0ec4cf76b",
            "block_id": "b00024",
            "supporting_quote": "In both trials, each vaccine dose was injected subcutaneously in an extremity once a week for 3 weeks, and then once a month for 5 months at weeks 8, 12, 16, 20 and 24. The same extremity was not used for consecutive injections. Patients were monitored for toxicity, objective tumor response and progression free survival (PFS) and OS. Concurrent anticancer therapy was not allowed, but patients could interrupt vaccine therapy for specific interventions, then resume vaccine treatment."
          },
          {
            "id": "CE-941475cc62799599dc41de15-span-5cb26188605a55be5e922402",
            "source_id": "report-9de9bad63a05d808bce9e37f:main:11a2def0ec4cf76b",
            "block_id": "b00090",
            "supporting_quote": "Summary points A total of 45 men and 27 women with metastatic melanoma were treated with patient-specific therapeutic vaccines during 2001–2011. The vaccines consisted of autologous dendritic cells loaded with antigens from irradiated autologous tumor cells from a short-term cell culture derived from one or more surgically resected metastases. Tumor sources were lymph nodes (n = 37), viscera (n = 20) and soft tissue (n = 15). The antigen-loaded dendritic cells were admixed with GM–CSF (500 µg) and injected subcutaneously weekly for 3 weeks and monthly for 5 months at weeks 8, 12, 16, 20 and 24. The average number of doses injected was 7.3 of a possible 8. Treatment was well tolerated, highest grade adverse event was 3 in five of 72 patients. Median survival was 49.4 months and 5-year survival rate was 46%. A total of 5-year survival rates based on cohorts defined at the time of vaccine treatment were, 72% for 18 patients who were stage 3 without measurable disease and 53% for 30 patients who were stage 4 without measurable disease. For the 24 patients who were stage 4 with measurable disease at the time of treatment, median survival was 18.5 months and 2-year survival rate was 46%."
          }
        ]
      }
    }
  },
  {
    "id": "reviewed-31406564:3:7",
    "pmid": "31406564",
    "samples": [
      "30"
    ],
    "contexts": [
      {
        "stage": "R2",
        "source": "ea590342175838f365b89abb609e65e13857e0d03cab004be38e6706d9f3a41a",
        "binding": "e4a9d3c16a54f68bbbec4c227dbe360752b29ef017977c42cfeb4ec148843b34",
        "population": "pop3",
        "comparator": null,
        "intervention": "arm1"
      },
      {
        "stage": "R3",
        "source": "c27a70ee703aa38dcf506d4a9d6b3ac722dc6f82d11e2822bddad9095a6a181c",
        "binding": "941475cc62799599dc41de15210d09f81547b0193984e5dc117dc6afbe5a4491",
        "population": "p-s4-nmd",
        "comparator": null,
        "intervention": "a-dcv"
      }
    ],
    "preferred_context": 1,
    "evidence": [
      {
        "id": "CE-e4a9d3c16a54f68bbbec4c22-span-4ec645606e5edaa7fb1de41c",
        "source_id": "report-9de9bad63a05d808bce9e37f:citation",
        "block_id": "abstract",
        "supporting_quote": "RESULTS: Toxicity was minimal. Median overall survival (OS) was 49.4 months; 5-year OS 46%. A 5-year OS was 72% for 18 recurrent stage 3 without measurable disease when treated and 53% for 30 stage 4 without measurable disease when treated. A total of 24 patients with measurable stage 4 when treated (median of four prior therapies) had an 18.5 months median OS and 46% 2-year OS.\n"
      },
      {
        "id": "CE-e4a9d3c16a54f68bbbec4c22-span-4429e2e0e768c0e4f56e0097",
        "source_id": "report-9de9bad63a05d808bce9e37f:citation",
        "block_id": "abstract",
        "supporting_quote": "AIM: Metastatic melanoma patients were treated with patient-specific vaccines consisting of autologous dendritic cells loaded with antigens from irradiated cells from short-term autologous tumor cell lines.\n"
      },
      {
        "id": "CE-e4a9d3c16a54f68bbbec4c22-span-be31c39d0a8f536986c93b2e",
        "source_id": "report-9de9bad63a05d808bce9e37f:citation",
        "block_id": "title",
        "supporting_quote": "Patient-specific dendritic cell vaccines with autologous tumor antigens in 72 patients with metastatic melanoma."
      },
      {
        "id": "CE-941475cc62799599dc41de15-span-4e9dde5d72c17bd34e252ed8",
        "source_id": "report-9de9bad63a05d808bce9e37f:main:11a2def0ec4cf76b",
        "block_id": "b00045",
        "supporting_quote": "Median age was 52 years (range: 17–83 years), and was also 52 years in each of the Phase II trials. Table 4 shows the proportions of different characteristics for all 72 patients and for the cohorts whose most advanced stage of disease at the time of treatment were recurrent stage 3 (n = 18) without measurable disease, stage 4 without measurable disease (n = 30) or stage 4 with measurable disease per response evaluation criteria in solid tumors (RECIST; n = 24). A patient’s most advanced stage of disease was considered to be recurrent stage 3 (n = 18) even if they had detectable or equivocal radiographic findings of distant metastatic disease if they had not been confirmed histologically (n = 3). The median time from tumor collection to enrollment for treatment was 7.1 months, and the median time from tumor collection to efforts to initiate a cell culture was 4.0 months. A total of 29 patients had recurrent stage 3 at the time of tumor collection, but 11 (38%) had experienced distant progression by the time of enrollment for treatment, and nine had measurable disease at that time. Of 33 patients with stage 4 disease at the time of tumor collection, 15 (45%) had recurred and had measurable disease at the time of treatment, while 18 (55%) had no evidence of disease at that time, often because of additional treatment procedures – including surgical resection of new metastases and stereotactic radiation for brain metastases. It is noteworthy that of the 54 patients, whose most advanced stage was stage 4, 14 (26%) had experienced brain metastases, and ten (19%) had experienced hepatic metastases."
      },
      {
        "id": "CE-941475cc62799599dc41de15-span-c3b29542f8ebd5981db9cc2f",
        "source_id": "report-9de9bad63a05d808bce9e37f:main:11a2def0ec4cf76b",
        "block_id": "b00058",
        "supporting_quote": "The 5-year OS for the 18 patients whose most advanced stage was recurrent stage 3 was 72%. For the 54 patients whose most advanced stage was stage 4, the median OS was 42.5 months with 1-, 2-, 3-, 4- and 5-year survival rates of 83, 67, 57, 43 and 37%, respectively. However, this included patients who had measurable or nonmeasurable disease at the time of treatment. Figure 2 shows OS curves for patients based on the extent of disease at the time of treatment. Median OS was greater than 60 months for recurrent stage 3 (95% CI lower limit: 38.7 months; n = 18) and for nonmeasurable stage 4 (n = 30), compared with 18.5 months (95% CI: 12.6–42.7 months) for patients with measurable stage 4 disease (n = 24). The 3-year survival rates were 83, 73 and 38%, respectively."
      },
      {
        "id": "CE-941475cc62799599dc41de15-span-371de35784f4de0312bcdced",
        "source_id": "report-9de9bad63a05d808bce9e37f:main:11a2def0ec4cf76b",
        "block_id": "b00022",
        "supporting_quote": "Just prior to administration, DCV was rapidly thawed in a 37°C water bath. The thawed cell suspension was then rinsed in 10 ml of sterile AIM-V (antibiotic-free) medium in a 50 ml conical tube. A cell count was performed prior to centrifugation and decantation of the wash phase. The cell pellet was then suspended in 1 ml saline and 500 μg of GM–CSF in a 1.5 ml vial, and finally drawn into a 3.0 ml syringe for injection with a 25-gauge needle within 5 h of thawing."
      },
      {
        "id": "CE-941475cc62799599dc41de15-span-749ff822e0cdd50baf0aef70",
        "source_id": "report-9de9bad63a05d808bce9e37f:main:11a2def0ec4cf76b",
        "block_id": "b00024",
        "supporting_quote": "In both trials, each vaccine dose was injected subcutaneously in an extremity once a week for 3 weeks, and then once a month for 5 months at weeks 8, 12, 16, 20 and 24. The same extremity was not used for consecutive injections. Patients were monitored for toxicity, objective tumor response and progression free survival (PFS) and OS. Concurrent anticancer therapy was not allowed, but patients could interrupt vaccine therapy for specific interventions, then resume vaccine treatment."
      },
      {
        "id": "CE-941475cc62799599dc41de15-span-5cb26188605a55be5e922402",
        "source_id": "report-9de9bad63a05d808bce9e37f:main:11a2def0ec4cf76b",
        "block_id": "b00090",
        "supporting_quote": "Summary points A total of 45 men and 27 women with metastatic melanoma were treated with patient-specific therapeutic vaccines during 2001–2011. The vaccines consisted of autologous dendritic cells loaded with antigens from irradiated autologous tumor cells from a short-term cell culture derived from one or more surgically resected metastases. Tumor sources were lymph nodes (n = 37), viscera (n = 20) and soft tissue (n = 15). The antigen-loaded dendritic cells were admixed with GM–CSF (500 µg) and injected subcutaneously weekly for 3 weeks and monthly for 5 months at weeks 8, 12, 16, 20 and 24. The average number of doses injected was 7.3 of a possible 8. Treatment was well tolerated, highest grade adverse event was 3 in five of 72 patients. Median survival was 49.4 months and 5-year survival rate was 46%. A total of 5-year survival rates based on cohorts defined at the time of vaccine treatment were, 72% for 18 patients who were stage 3 without measurable disease and 53% for 30 patients who were stage 4 without measurable disease. For the 24 patients who were stage 4 with measurable disease at the time of treatment, median survival was 18.5 months and 2-year survival rate was 46%."
      }
    ],
    "reason": "Both stages describe the same72 DCV-treated patients and the same18 recurrent-stage3,30 stage4 nonmeasurable and24 stage4 measurable subsets. Every vaccine dose was admixed with500 micrograms GM-CSF. Adding that component clarifies the existing regimen, not an additional cohort.",
    "treatment_preferences": {
      "intervention": {
        "context": 1,
        "reason": "Every autologous dendritic-cell vaccine injection was admixed with 500 micrograms of GM-CSF. This completes the administered regimen for the same cohort; the distinct stage and measurable-disease subsets remain separate.",
        "evidence": [
          {
            "id": "CE-941475cc62799599dc41de15-span-371de35784f4de0312bcdced",
            "source_id": "report-9de9bad63a05d808bce9e37f:main:11a2def0ec4cf76b",
            "block_id": "b00022",
            "supporting_quote": "Just prior to administration, DCV was rapidly thawed in a 37°C water bath. The thawed cell suspension was then rinsed in 10 ml of sterile AIM-V (antibiotic-free) medium in a 50 ml conical tube. A cell count was performed prior to centrifugation and decantation of the wash phase. The cell pellet was then suspended in 1 ml saline and 500 μg of GM–CSF in a 1.5 ml vial, and finally drawn into a 3.0 ml syringe for injection with a 25-gauge needle within 5 h of thawing."
          },
          {
            "id": "CE-941475cc62799599dc41de15-span-749ff822e0cdd50baf0aef70",
            "source_id": "report-9de9bad63a05d808bce9e37f:main:11a2def0ec4cf76b",
            "block_id": "b00024",
            "supporting_quote": "In both trials, each vaccine dose was injected subcutaneously in an extremity once a week for 3 weeks, and then once a month for 5 months at weeks 8, 12, 16, 20 and 24. The same extremity was not used for consecutive injections. Patients were monitored for toxicity, objective tumor response and progression free survival (PFS) and OS. Concurrent anticancer therapy was not allowed, but patients could interrupt vaccine therapy for specific interventions, then resume vaccine treatment."
          },
          {
            "id": "CE-941475cc62799599dc41de15-span-5cb26188605a55be5e922402",
            "source_id": "report-9de9bad63a05d808bce9e37f:main:11a2def0ec4cf76b",
            "block_id": "b00090",
            "supporting_quote": "Summary points A total of 45 men and 27 women with metastatic melanoma were treated with patient-specific therapeutic vaccines during 2001–2011. The vaccines consisted of autologous dendritic cells loaded with antigens from irradiated autologous tumor cells from a short-term cell culture derived from one or more surgically resected metastases. Tumor sources were lymph nodes (n = 37), viscera (n = 20) and soft tissue (n = 15). The antigen-loaded dendritic cells were admixed with GM–CSF (500 µg) and injected subcutaneously weekly for 3 weeks and monthly for 5 months at weeks 8, 12, 16, 20 and 24. The average number of doses injected was 7.3 of a possible 8. Treatment was well tolerated, highest grade adverse event was 3 in five of 72 patients. Median survival was 49.4 months and 5-year survival rate was 46%. A total of 5-year survival rates based on cohorts defined at the time of vaccine treatment were, 72% for 18 patients who were stage 3 without measurable disease and 53% for 30 patients who were stage 4 without measurable disease. For the 24 patients who were stage 4 with measurable disease at the time of treatment, median survival was 18.5 months and 2-year survival rate was 46%."
          }
        ]
      }
    }
  },
  {
    "id": "reviewed-31406564:4:8",
    "pmid": "31406564",
    "samples": [
      "24"
    ],
    "contexts": [
      {
        "stage": "R2",
        "source": "ea590342175838f365b89abb609e65e13857e0d03cab004be38e6706d9f3a41a",
        "binding": "e4a9d3c16a54f68bbbec4c227dbe360752b29ef017977c42cfeb4ec148843b34",
        "population": "pop4",
        "comparator": null,
        "intervention": "arm1"
      },
      {
        "stage": "R3",
        "source": "c27a70ee703aa38dcf506d4a9d6b3ac722dc6f82d11e2822bddad9095a6a181c",
        "binding": "941475cc62799599dc41de15210d09f81547b0193984e5dc117dc6afbe5a4491",
        "population": "p-s4-md",
        "comparator": null,
        "intervention": "a-dcv"
      }
    ],
    "preferred_context": 1,
    "evidence": [
      {
        "id": "CE-e4a9d3c16a54f68bbbec4c22-span-4ec645606e5edaa7fb1de41c",
        "source_id": "report-9de9bad63a05d808bce9e37f:citation",
        "block_id": "abstract",
        "supporting_quote": "RESULTS: Toxicity was minimal. Median overall survival (OS) was 49.4 months; 5-year OS 46%. A 5-year OS was 72% for 18 recurrent stage 3 without measurable disease when treated and 53% for 30 stage 4 without measurable disease when treated. A total of 24 patients with measurable stage 4 when treated (median of four prior therapies) had an 18.5 months median OS and 46% 2-year OS.\n"
      },
      {
        "id": "CE-e4a9d3c16a54f68bbbec4c22-span-4429e2e0e768c0e4f56e0097",
        "source_id": "report-9de9bad63a05d808bce9e37f:citation",
        "block_id": "abstract",
        "supporting_quote": "AIM: Metastatic melanoma patients were treated with patient-specific vaccines consisting of autologous dendritic cells loaded with antigens from irradiated cells from short-term autologous tumor cell lines.\n"
      },
      {
        "id": "CE-e4a9d3c16a54f68bbbec4c22-span-be31c39d0a8f536986c93b2e",
        "source_id": "report-9de9bad63a05d808bce9e37f:citation",
        "block_id": "title",
        "supporting_quote": "Patient-specific dendritic cell vaccines with autologous tumor antigens in 72 patients with metastatic melanoma."
      },
      {
        "id": "CE-941475cc62799599dc41de15-span-4e9dde5d72c17bd34e252ed8",
        "source_id": "report-9de9bad63a05d808bce9e37f:main:11a2def0ec4cf76b",
        "block_id": "b00045",
        "supporting_quote": "Median age was 52 years (range: 17–83 years), and was also 52 years in each of the Phase II trials. Table 4 shows the proportions of different characteristics for all 72 patients and for the cohorts whose most advanced stage of disease at the time of treatment were recurrent stage 3 (n = 18) without measurable disease, stage 4 without measurable disease (n = 30) or stage 4 with measurable disease per response evaluation criteria in solid tumors (RECIST; n = 24). A patient’s most advanced stage of disease was considered to be recurrent stage 3 (n = 18) even if they had detectable or equivocal radiographic findings of distant metastatic disease if they had not been confirmed histologically (n = 3). The median time from tumor collection to enrollment for treatment was 7.1 months, and the median time from tumor collection to efforts to initiate a cell culture was 4.0 months. A total of 29 patients had recurrent stage 3 at the time of tumor collection, but 11 (38%) had experienced distant progression by the time of enrollment for treatment, and nine had measurable disease at that time. Of 33 patients with stage 4 disease at the time of tumor collection, 15 (45%) had recurred and had measurable disease at the time of treatment, while 18 (55%) had no evidence of disease at that time, often because of additional treatment procedures – including surgical resection of new metastases and stereotactic radiation for brain metastases. It is noteworthy that of the 54 patients, whose most advanced stage was stage 4, 14 (26%) had experienced brain metastases, and ten (19%) had experienced hepatic metastases."
      },
      {
        "id": "CE-941475cc62799599dc41de15-span-c3b29542f8ebd5981db9cc2f",
        "source_id": "report-9de9bad63a05d808bce9e37f:main:11a2def0ec4cf76b",
        "block_id": "b00058",
        "supporting_quote": "The 5-year OS for the 18 patients whose most advanced stage was recurrent stage 3 was 72%. For the 54 patients whose most advanced stage was stage 4, the median OS was 42.5 months with 1-, 2-, 3-, 4- and 5-year survival rates of 83, 67, 57, 43 and 37%, respectively. However, this included patients who had measurable or nonmeasurable disease at the time of treatment. Figure 2 shows OS curves for patients based on the extent of disease at the time of treatment. Median OS was greater than 60 months for recurrent stage 3 (95% CI lower limit: 38.7 months; n = 18) and for nonmeasurable stage 4 (n = 30), compared with 18.5 months (95% CI: 12.6–42.7 months) for patients with measurable stage 4 disease (n = 24). The 3-year survival rates were 83, 73 and 38%, respectively."
      },
      {
        "id": "CE-941475cc62799599dc41de15-span-371de35784f4de0312bcdced",
        "source_id": "report-9de9bad63a05d808bce9e37f:main:11a2def0ec4cf76b",
        "block_id": "b00022",
        "supporting_quote": "Just prior to administration, DCV was rapidly thawed in a 37°C water bath. The thawed cell suspension was then rinsed in 10 ml of sterile AIM-V (antibiotic-free) medium in a 50 ml conical tube. A cell count was performed prior to centrifugation and decantation of the wash phase. The cell pellet was then suspended in 1 ml saline and 500 μg of GM–CSF in a 1.5 ml vial, and finally drawn into a 3.0 ml syringe for injection with a 25-gauge needle within 5 h of thawing."
      },
      {
        "id": "CE-941475cc62799599dc41de15-span-749ff822e0cdd50baf0aef70",
        "source_id": "report-9de9bad63a05d808bce9e37f:main:11a2def0ec4cf76b",
        "block_id": "b00024",
        "supporting_quote": "In both trials, each vaccine dose was injected subcutaneously in an extremity once a week for 3 weeks, and then once a month for 5 months at weeks 8, 12, 16, 20 and 24. The same extremity was not used for consecutive injections. Patients were monitored for toxicity, objective tumor response and progression free survival (PFS) and OS. Concurrent anticancer therapy was not allowed, but patients could interrupt vaccine therapy for specific interventions, then resume vaccine treatment."
      },
      {
        "id": "CE-941475cc62799599dc41de15-span-5cb26188605a55be5e922402",
        "source_id": "report-9de9bad63a05d808bce9e37f:main:11a2def0ec4cf76b",
        "block_id": "b00090",
        "supporting_quote": "Summary points A total of 45 men and 27 women with metastatic melanoma were treated with patient-specific therapeutic vaccines during 2001–2011. The vaccines consisted of autologous dendritic cells loaded with antigens from irradiated autologous tumor cells from a short-term cell culture derived from one or more surgically resected metastases. Tumor sources were lymph nodes (n = 37), viscera (n = 20) and soft tissue (n = 15). The antigen-loaded dendritic cells were admixed with GM–CSF (500 µg) and injected subcutaneously weekly for 3 weeks and monthly for 5 months at weeks 8, 12, 16, 20 and 24. The average number of doses injected was 7.3 of a possible 8. Treatment was well tolerated, highest grade adverse event was 3 in five of 72 patients. Median survival was 49.4 months and 5-year survival rate was 46%. A total of 5-year survival rates based on cohorts defined at the time of vaccine treatment were, 72% for 18 patients who were stage 3 without measurable disease and 53% for 30 patients who were stage 4 without measurable disease. For the 24 patients who were stage 4 with measurable disease at the time of treatment, median survival was 18.5 months and 2-year survival rate was 46%."
      }
    ],
    "reason": "Both stages describe the same72 DCV-treated patients and the same18 recurrent-stage3,30 stage4 nonmeasurable and24 stage4 measurable subsets. Every vaccine dose was admixed with500 micrograms GM-CSF. Adding that component clarifies the existing regimen, not an additional cohort.",
    "treatment_preferences": {
      "intervention": {
        "context": 1,
        "reason": "Every autologous dendritic-cell vaccine injection was admixed with 500 micrograms of GM-CSF. This completes the administered regimen for the same cohort; the distinct stage and measurable-disease subsets remain separate.",
        "evidence": [
          {
            "id": "CE-941475cc62799599dc41de15-span-371de35784f4de0312bcdced",
            "source_id": "report-9de9bad63a05d808bce9e37f:main:11a2def0ec4cf76b",
            "block_id": "b00022",
            "supporting_quote": "Just prior to administration, DCV was rapidly thawed in a 37°C water bath. The thawed cell suspension was then rinsed in 10 ml of sterile AIM-V (antibiotic-free) medium in a 50 ml conical tube. A cell count was performed prior to centrifugation and decantation of the wash phase. The cell pellet was then suspended in 1 ml saline and 500 μg of GM–CSF in a 1.5 ml vial, and finally drawn into a 3.0 ml syringe for injection with a 25-gauge needle within 5 h of thawing."
          },
          {
            "id": "CE-941475cc62799599dc41de15-span-749ff822e0cdd50baf0aef70",
            "source_id": "report-9de9bad63a05d808bce9e37f:main:11a2def0ec4cf76b",
            "block_id": "b00024",
            "supporting_quote": "In both trials, each vaccine dose was injected subcutaneously in an extremity once a week for 3 weeks, and then once a month for 5 months at weeks 8, 12, 16, 20 and 24. The same extremity was not used for consecutive injections. Patients were monitored for toxicity, objective tumor response and progression free survival (PFS) and OS. Concurrent anticancer therapy was not allowed, but patients could interrupt vaccine therapy for specific interventions, then resume vaccine treatment."
          },
          {
            "id": "CE-941475cc62799599dc41de15-span-5cb26188605a55be5e922402",
            "source_id": "report-9de9bad63a05d808bce9e37f:main:11a2def0ec4cf76b",
            "block_id": "b00090",
            "supporting_quote": "Summary points A total of 45 men and 27 women with metastatic melanoma were treated with patient-specific therapeutic vaccines during 2001–2011. The vaccines consisted of autologous dendritic cells loaded with antigens from irradiated autologous tumor cells from a short-term cell culture derived from one or more surgically resected metastases. Tumor sources were lymph nodes (n = 37), viscera (n = 20) and soft tissue (n = 15). The antigen-loaded dendritic cells were admixed with GM–CSF (500 µg) and injected subcutaneously weekly for 3 weeks and monthly for 5 months at weeks 8, 12, 16, 20 and 24. The average number of doses injected was 7.3 of a possible 8. Treatment was well tolerated, highest grade adverse event was 3 in five of 72 patients. Median survival was 49.4 months and 5-year survival rate was 46%. A total of 5-year survival rates based on cohorts defined at the time of vaccine treatment were, 72% for 18 patients who were stage 3 without measurable disease and 53% for 30 patients who were stage 4 without measurable disease. For the 24 patients who were stage 4 with measurable disease at the time of treatment, median survival was 18.5 months and 2-year survival rate was 46%."
          }
        ]
      }
    }
  },
  {
    "id": "reviewed-29672342:1:4",
    "pmid": "29672342",
    "samples": [
      "15"
    ],
    "contexts": [
      {
        "stage": "R2",
        "source": "e98da9feb6f0213728436fea15ae863c9f314bed578a34c883f09e7b9b71d32e",
        "binding": "48b35ca89d3527c68803fdf344a72b70c7dac6e1e35fa7c2642210b810cc3ca1",
        "population": "p2",
        "comparator": null,
        "intervention": "a1"
      },
      {
        "stage": "R3",
        "source": "bda725cf8736975ebfc94654138055e41e376bb2d5d5a95b4a6c71a26fd056f3",
        "binding": "561de806180f0b8ba0a1a54b4f3ca97e2f3f335d6d745392f0592bacfa2b3cc9",
        "population": "p2",
        "comparator": null,
        "intervention": "a1"
      }
    ],
    "preferred_context": 1,
    "evidence": [
      {
        "id": "CE-48b35ca89d3527c68803fdf3-span-95fe7679c29ca67b459f811e",
        "source_id": "report-14b9c576e610ed7478c193c3:citation",
        "block_id": "abstract",
        "supporting_quote": "Brain metastases cause significant morbidity and mortality in patients with metastatic melanoma. Although adoptive cell therapy (ACT) with tumor-infiltrating lymphocytes (TIL) can achieve complete and durable remission of advanced cutaneous melanoma, the efficacy of this therapy for brain metastases is unclear. Records of patients with M1c melanoma treated with ACT using TIL, including patients with treated and untreated brain metastases, were analyzed. Treatment consisted of preparative chemotherapy, autologous TIL infusion, and high-dose interleukin-2. Treatment outcomes, sites of initial tumor progression, and overall survival were analyzed. Among 144 total patients, 15 patients with treated and 18 patients with untreated brain metastases were identified. Intracranial objective responses (OR) occurred in 28% patients with untreated brain metastases. The systemic OR rates for patients with M1c disease without identified brain disease, treated brain disease, and untreated brain disease, and were 49%, 33% and 33%, respectively, of which 59%, 20% and 16% were durable at last follow-up. The site of untreated brain disease was the most likely site of initial tumor progression (61%) in patients with untreated brain metastases. Overall, we found that ACT with TIL can eliminate small melanoma brain metastases. However, following TIL therapy these patients frequently progress in the brain at a site of untreated brain disease. Patients with treated or untreated brain disease are less likely to achieve durable systemic ORs following TIL therapy compared with M1c disease and no history of brain disease. Melanoma brain metastases likely require local therapy despite the systemic effect of ACT."
      },
      {
        "id": "CE-561de806180f0b8ba0a1a54b-span-b4dc57898798e2c9c946c164",
        "source_id": "report-14b9c576e610ed7478c193c3:main:76c6e538ab8356f4",
        "block_id": "b00021",
        "supporting_quote": "One-hundred forty-four patients with M1c metastatic melanoma were treated with TIL and met our study inclusion criteria ( Table 1 ). There were 111 patients with M1c disease and no history of brain disease, 15 patients with treated brain metastases, and 18 patients with untreated brain metastases. Three of the 18 patients with untreated brain disease had been included in our preliminary report.( 8 ) All patients received the planned preparative non-myeloablative chemotherapy. Fifty-six patients (39%) received total body irradiation before cell infusion. Although more patients without brain metastases received TBI than patient with treated or untreated brain metastases, the addition of TBI has not been demonstrated to improve the rate or duration of response.( 5 ) The number of IL-2 doses appeared to be similar in the 3 cohorts ( Table 1 ). One patient with an untreated brain metastasis did not receive IL-2 because of immediate toxicity related to the cell infusion. Two patients without brain metastases had received prior ACT with TIL. Median follow-up was 1.1 years for all patients (range 0.1 to 13.5 years)."
      },
      {
        "id": "CE-561de806180f0b8ba0a1a54b-span-65c7026c98460499b5c06b30",
        "source_id": "report-14b9c576e610ed7478c193c3:main:76c6e538ab8356f4",
        "block_id": "b00014",
        "supporting_quote": "The general design of our TIL infusion protocols has been previously reported.( 4 ) Eligible patients received a non-myeloablative conditioning regimen that consisted of cyclophosphamide 60 mg/kg/day for 2 days (days −7 and −6 before ACT) and fludarabine 25 mg/m 2 /day for 5 days (days −7 to −3). On select protocols, total body irradiation (TBI; 200 or 1200 cGy) was added to provide additional lymphodepletion 1 to 3 days before TIL transfer. Patients treated with TBI received an additional infusion of autologous CD34+ hematopoietic stem cells, as previously described. Patient who received TBI were included because a randomized control trial demonstrated no difference when TBI is added to preparative regimen.( 5 ) Following TIL infusion, patients received Interleukin-2 (IL-2) (720,000 IU/kg) every 8 hours as tolerated. Patients with brain disease were closely monitored for thrombocytopenia and transfused as necessary to maintain a platelet count of approximately ≥ 20,000 cells/μL."
      }
    ],
    "reason": "Both stages describe the same15 treated-brain and18 untreated-brain-metastasis cohorts. Full text specifies preparative cyclophosphamide/fludarabine, TIL infusion then IL2. Preserve the two brain-status cohorts and source treatment exceptions; sequence should follow the full-text protocol.",
    "treatment_preferences": {
      "intervention": {
        "context": 1,
        "reason": "The full-text protocol specifies cyclophosphamide plus fludarabine conditioning, followed by TIL infusion, then aldesleukin as tolerated. This completes the same brain-status cohort regimen. Source exceptions remain in evidence: one untreated-brain-metastasis patient received no IL-2 because of immediate toxicity, and irradiation/stem-cell conditioning varied by protocol.",
        "evidence": [
          {
            "id": "CE-561de806180f0b8ba0a1a54b-span-b4dc57898798e2c9c946c164",
            "source_id": "report-14b9c576e610ed7478c193c3:main:76c6e538ab8356f4",
            "block_id": "b00021",
            "supporting_quote": "One-hundred forty-four patients with M1c metastatic melanoma were treated with TIL and met our study inclusion criteria ( Table 1 ). There were 111 patients with M1c disease and no history of brain disease, 15 patients with treated brain metastases, and 18 patients with untreated brain metastases. Three of the 18 patients with untreated brain disease had been included in our preliminary report.( 8 ) All patients received the planned preparative non-myeloablative chemotherapy. Fifty-six patients (39%) received total body irradiation before cell infusion. Although more patients without brain metastases received TBI than patient with treated or untreated brain metastases, the addition of TBI has not been demonstrated to improve the rate or duration of response.( 5 ) The number of IL-2 doses appeared to be similar in the 3 cohorts ( Table 1 ). One patient with an untreated brain metastasis did not receive IL-2 because of immediate toxicity related to the cell infusion. Two patients without brain metastases had received prior ACT with TIL. Median follow-up was 1.1 years for all patients (range 0.1 to 13.5 years)."
          },
          {
            "id": "CE-561de806180f0b8ba0a1a54b-span-65c7026c98460499b5c06b30",
            "source_id": "report-14b9c576e610ed7478c193c3:main:76c6e538ab8356f4",
            "block_id": "b00014",
            "supporting_quote": "The general design of our TIL infusion protocols has been previously reported.( 4 ) Eligible patients received a non-myeloablative conditioning regimen that consisted of cyclophosphamide 60 mg/kg/day for 2 days (days −7 and −6 before ACT) and fludarabine 25 mg/m 2 /day for 5 days (days −7 to −3). On select protocols, total body irradiation (TBI; 200 or 1200 cGy) was added to provide additional lymphodepletion 1 to 3 days before TIL transfer. Patients treated with TBI received an additional infusion of autologous CD34+ hematopoietic stem cells, as previously described. Patient who received TBI were included because a randomized control trial demonstrated no difference when TBI is added to preparative regimen.( 5 ) Following TIL infusion, patients received Interleukin-2 (IL-2) (720,000 IU/kg) every 8 hours as tolerated. Patients with brain disease were closely monitored for thrombocytopenia and transfused as necessary to maintain a platelet count of approximately ≥ 20,000 cells/μL."
          }
        ]
      }
    }
  },
  {
    "id": "reviewed-29672342:2:5",
    "pmid": "29672342",
    "samples": [
      "18"
    ],
    "contexts": [
      {
        "stage": "R2",
        "source": "e98da9feb6f0213728436fea15ae863c9f314bed578a34c883f09e7b9b71d32e",
        "binding": "48b35ca89d3527c68803fdf344a72b70c7dac6e1e35fa7c2642210b810cc3ca1",
        "population": "p3",
        "comparator": null,
        "intervention": "a1"
      },
      {
        "stage": "R3",
        "source": "bda725cf8736975ebfc94654138055e41e376bb2d5d5a95b4a6c71a26fd056f3",
        "binding": "561de806180f0b8ba0a1a54b4f3ca97e2f3f335d6d745392f0592bacfa2b3cc9",
        "population": "p3",
        "comparator": null,
        "intervention": "a1"
      }
    ],
    "preferred_context": 1,
    "evidence": [
      {
        "id": "CE-48b35ca89d3527c68803fdf3-span-95fe7679c29ca67b459f811e",
        "source_id": "report-14b9c576e610ed7478c193c3:citation",
        "block_id": "abstract",
        "supporting_quote": "Brain metastases cause significant morbidity and mortality in patients with metastatic melanoma. Although adoptive cell therapy (ACT) with tumor-infiltrating lymphocytes (TIL) can achieve complete and durable remission of advanced cutaneous melanoma, the efficacy of this therapy for brain metastases is unclear. Records of patients with M1c melanoma treated with ACT using TIL, including patients with treated and untreated brain metastases, were analyzed. Treatment consisted of preparative chemotherapy, autologous TIL infusion, and high-dose interleukin-2. Treatment outcomes, sites of initial tumor progression, and overall survival were analyzed. Among 144 total patients, 15 patients with treated and 18 patients with untreated brain metastases were identified. Intracranial objective responses (OR) occurred in 28% patients with untreated brain metastases. The systemic OR rates for patients with M1c disease without identified brain disease, treated brain disease, and untreated brain disease, and were 49%, 33% and 33%, respectively, of which 59%, 20% and 16% were durable at last follow-up. The site of untreated brain disease was the most likely site of initial tumor progression (61%) in patients with untreated brain metastases. Overall, we found that ACT with TIL can eliminate small melanoma brain metastases. However, following TIL therapy these patients frequently progress in the brain at a site of untreated brain disease. Patients with treated or untreated brain disease are less likely to achieve durable systemic ORs following TIL therapy compared with M1c disease and no history of brain disease. Melanoma brain metastases likely require local therapy despite the systemic effect of ACT."
      },
      {
        "id": "CE-561de806180f0b8ba0a1a54b-span-588ffec986198cfa2b87f6e1",
        "source_id": "report-14b9c576e610ed7478c193c3:main:76c6e538ab8356f4",
        "block_id": "b00009",
        "supporting_quote": "The NCI Surgery Branch has conducted multiple clinical trials to investigate the efficacy of ACT with autologous TIL given in conjunction with a preparative non-myeloablative conditioning and high-dose IL-2 for patients with advanced melanoma. From 2001 to 2016, 502 patients met protocol eligibility requirements which included age ≥ 18, ECOG score < 2, life expectancy of > 3 months, and adequate hepatic, renal, and hematopoietic reserve and were treated with melanoma TIL. Patients had evaluable extracranial disease and were enrolled on NCI IRB-approved clinical trials. From this group, all patients with M1c disease at time of treatment were identified.( 10 ) Patients with a history of treated brain disease were eligible if all lesions were resected or lesions were treated with radiation and documented to be stable for a minimum of 4 weeks. Patients with untreated brain metastasis were eligible if they had ≤ 3 lesions, each measuring ≤ 10 mm and without significant edema (1 patient had 5 metastases and 2 of these were identified retrospectively). Patients with leptomeningeal disease, intra-axial spinal cord lesions, and those on corticosteroid therapy were excluded. Because our TIL production process had been modified over the 15-year study period and to increase the homogeneity of our study population we included only patients who received a TIL cell product generated from tumor fragments, representing how TIL are currently derived in the Surgery Branch. Patients treated with autologous lymphocytes generated from either a core biopsy or from bulk TIL cultures were excluded, as were patients enrolled as a compassionate exemption. One hundred forty-four patients met our study criteria and were the focus of this analysis. This M1c population was analyzed in 3 cohorts; M1c disease and no history of brain disease, M1c disease with treated brain metastases, and M1c disease with untreated brain metastases."
      },
      {
        "id": "CE-561de806180f0b8ba0a1a54b-span-b4dc57898798e2c9c946c164",
        "source_id": "report-14b9c576e610ed7478c193c3:main:76c6e538ab8356f4",
        "block_id": "b00021",
        "supporting_quote": "One-hundred forty-four patients with M1c metastatic melanoma were treated with TIL and met our study inclusion criteria ( Table 1 ). There were 111 patients with M1c disease and no history of brain disease, 15 patients with treated brain metastases, and 18 patients with untreated brain metastases. Three of the 18 patients with untreated brain disease had been included in our preliminary report.( 8 ) All patients received the planned preparative non-myeloablative chemotherapy. Fifty-six patients (39%) received total body irradiation before cell infusion. Although more patients without brain metastases received TBI than patient with treated or untreated brain metastases, the addition of TBI has not been demonstrated to improve the rate or duration of response.( 5 ) The number of IL-2 doses appeared to be similar in the 3 cohorts ( Table 1 ). One patient with an untreated brain metastasis did not receive IL-2 because of immediate toxicity related to the cell infusion. Two patients without brain metastases had received prior ACT with TIL. Median follow-up was 1.1 years for all patients (range 0.1 to 13.5 years)."
      },
      {
        "id": "CE-561de806180f0b8ba0a1a54b-span-65c7026c98460499b5c06b30",
        "source_id": "report-14b9c576e610ed7478c193c3:main:76c6e538ab8356f4",
        "block_id": "b00014",
        "supporting_quote": "The general design of our TIL infusion protocols has been previously reported.( 4 ) Eligible patients received a non-myeloablative conditioning regimen that consisted of cyclophosphamide 60 mg/kg/day for 2 days (days −7 and −6 before ACT) and fludarabine 25 mg/m 2 /day for 5 days (days −7 to −3). On select protocols, total body irradiation (TBI; 200 or 1200 cGy) was added to provide additional lymphodepletion 1 to 3 days before TIL transfer. Patients treated with TBI received an additional infusion of autologous CD34+ hematopoietic stem cells, as previously described. Patient who received TBI were included because a randomized control trial demonstrated no difference when TBI is added to preparative regimen.( 5 ) Following TIL infusion, patients received Interleukin-2 (IL-2) (720,000 IU/kg) every 8 hours as tolerated. Patients with brain disease were closely monitored for thrombocytopenia and transfused as necessary to maintain a platelet count of approximately ≥ 20,000 cells/μL."
      }
    ],
    "reason": "Both stages describe the same15 treated-brain and18 untreated-brain-metastasis cohorts. Full text specifies preparative cyclophosphamide/fludarabine, TIL infusion then IL2. Preserve the two brain-status cohorts and source treatment exceptions; sequence should follow the full-text protocol.",
    "treatment_preferences": {
      "intervention": {
        "context": 1,
        "reason": "The full-text protocol specifies cyclophosphamide plus fludarabine conditioning, followed by TIL infusion, then aldesleukin as tolerated. This completes the same brain-status cohort regimen. Source exceptions remain in evidence: one untreated-brain-metastasis patient received no IL-2 because of immediate toxicity, and irradiation/stem-cell conditioning varied by protocol.",
        "evidence": [
          {
            "id": "CE-561de806180f0b8ba0a1a54b-span-b4dc57898798e2c9c946c164",
            "source_id": "report-14b9c576e610ed7478c193c3:main:76c6e538ab8356f4",
            "block_id": "b00021",
            "supporting_quote": "One-hundred forty-four patients with M1c metastatic melanoma were treated with TIL and met our study inclusion criteria ( Table 1 ). There were 111 patients with M1c disease and no history of brain disease, 15 patients with treated brain metastases, and 18 patients with untreated brain metastases. Three of the 18 patients with untreated brain disease had been included in our preliminary report.( 8 ) All patients received the planned preparative non-myeloablative chemotherapy. Fifty-six patients (39%) received total body irradiation before cell infusion. Although more patients without brain metastases received TBI than patient with treated or untreated brain metastases, the addition of TBI has not been demonstrated to improve the rate or duration of response.( 5 ) The number of IL-2 doses appeared to be similar in the 3 cohorts ( Table 1 ). One patient with an untreated brain metastasis did not receive IL-2 because of immediate toxicity related to the cell infusion. Two patients without brain metastases had received prior ACT with TIL. Median follow-up was 1.1 years for all patients (range 0.1 to 13.5 years)."
          },
          {
            "id": "CE-561de806180f0b8ba0a1a54b-span-65c7026c98460499b5c06b30",
            "source_id": "report-14b9c576e610ed7478c193c3:main:76c6e538ab8356f4",
            "block_id": "b00014",
            "supporting_quote": "The general design of our TIL infusion protocols has been previously reported.( 4 ) Eligible patients received a non-myeloablative conditioning regimen that consisted of cyclophosphamide 60 mg/kg/day for 2 days (days −7 and −6 before ACT) and fludarabine 25 mg/m 2 /day for 5 days (days −7 to −3). On select protocols, total body irradiation (TBI; 200 or 1200 cGy) was added to provide additional lymphodepletion 1 to 3 days before TIL transfer. Patients treated with TBI received an additional infusion of autologous CD34+ hematopoietic stem cells, as previously described. Patient who received TBI were included because a randomized control trial demonstrated no difference when TBI is added to preparative regimen.( 5 ) Following TIL infusion, patients received Interleukin-2 (IL-2) (720,000 IU/kg) every 8 hours as tolerated. Patients with brain disease were closely monitored for thrombocytopenia and transfused as necessary to maintain a platelet count of approximately ≥ 20,000 cells/μL."
          }
        ]
      }
    }
  },
  {
    "id": "reviewed-24145345:1:6",
    "pmid": "24145345",
    "samples": [
      "90"
    ],
    "contexts": [
      {
        "stage": "R2",
        "source": "f4652542348564bdfad08fe65ea965f9bf54ce90330c0e5ef1d972bcf5591634",
        "binding": "6a8d02a1526b63142c44ca992149174b067048b7bcf5cd01b0e3748a33f46162",
        "population": "p1",
        "comparator": null,
        "intervention": "a1"
      },
      {
        "stage": "R3",
        "source": "96f62ffb6455198bb13e60189fe03e2838e345a3f91cfa5450d88c69e6916100",
        "binding": "3d8eec84671e98906b6a26f1beecbbb9885cc65e405191b3ce8a0c25ad675425",
        "population": "p_all",
        "comparator": null,
        "intervention": "a_all"
      }
    ],
    "preferred_context": 1,
    "evidence": [
      {
        "id": "CE-6a8d02a1526b63142c44ca99-span-ed0516e46a1d47743235ba7f",
        "source_id": "report-65875e0544371b4e292a70e4:citation",
        "block_id": "abstract",
        "supporting_quote": "PATIENTS AND METHODS: In this phase I study, 90 patients with unresectable stage III or IV melanoma who were ipilimumab naive and had experienced progression after at least one prior therapy (cohorts 1 to 3, 34 patients) or experienced progression after prior ipilimumab (cohorts 4 to 6, 56 patients) received nivolumab at 1, 3, or 10 mg/kg every 2 weeks for 24 weeks, then every 12 weeks for up to 2 years, with or without a multipeptide vaccine.\n"
      },
      {
        "id": "CE-3d8eec84671e98906b6a26f1-span-eb0d72ce2adc927ea6fd6282",
        "source_id": "report-65875e0544371b4e292a70e4:main-html:2b5c951227f1525d",
        "block_id": "b00010",
        "supporting_quote": "Ninety patients were enrolled at Moffitt Cancer Center onto this trial approved by the University of South Florida Institutional Review Board (ClinicalTrials.gov identifier: NCT01176461 ). Inclusion criteria included written informed consent; age ≥ 16 years; histologic diagnosis of unresectable stage III or IV melanoma with measurable disease by RECIST 1.1; progressive disease after at least one previous systemic treatment; positive tumor staining in at least 10% of tumor cells for gp100, NY-ESO-1, and/or MART-1; Eastern Cooperative Oncology Group performance status of 0 or 1; and adequate hepatic, renal, and hematologic function. Patients were prescreened for HLA-A*0201 by allele-specific polymerase chain reaction for cohorts 1 to 5. Patients with treated brain metastases were allowed if they were radiologically stable 8 weeks after treatment; patients with untreated brain metastases were allowed in cohort 6. Any number of prior therapies was allowed; treatment with prior anti–PD-1 or anti–PD-L1 was not. The 34 patients in consecutively accrued cohorts 1 to 3 were ipilimumab naive and received nivolumab with peptide vaccine, and the 56 patients in cohorts 4 to 6 (ipilimumab refractory) had progressive disease without responding to prior ipilimumab. Cohorts 4 and 5 were consecutively accrued and received nivolumab with peptide vaccine, and cohort 6 received nivolumab alone and accrued concurrently with cohorts 4 to 5 ( Table 1 ). Before completing one cycle, in cohorts 1 to 3, two patients experienced progression, one withdrew consent, and one developed dose-limiting optic neuritis; in cohorts 4 to 6, one patient withdrew consent. All five patients had progressive disease, were included in the analysis for safety and efficacy, and were replaced per protocol. No patients were ineligible or lost to follow-up."
      },
      {
        "id": "CE-3d8eec84671e98906b6a26f1-span-e808ca1743a279dfc175631c",
        "source_id": "report-65875e0544371b4e292a70e4:main-html:2b5c951227f1525d",
        "block_id": "b00021",
        "supporting_quote": "Between August 2010 and December 2012, 102 patients were screened, and 90 patients were enrolled. All patients were evaluated for toxicity, 87 were evaluated for response, and three were too early for response evaluation. In cohorts 1 to 3, 10 patients received 1 mg/kg, 13 patients received 3 mg/kg, and 11 patients received 10 mg/kg of nivolumab and were evaluable for efficacy and safety. Thirty patients completed cycle 1 and were evaluable for immune response, and four patients dropped out as a result of progression. In cohorts 4 and 5, 15 patients completed nivolumab at 3 mg/kg in cycle 1 and were evaluable for toxicity, efficacy, and immune response. In cohort 6, 41 patients were treated with nivolumab 3 mg/kg, and one patient dropped out as a result of progression; all patients were evaluable for safety and 37 were evaluable for efficacy. Median age was 62 years. Seventy percent of patients had American Joint Commission on Cancer M1c disease. Thirty patients received two or more prior therapies for metastatic disease. Seventy-four patients had primary cutaneous melanoma. Eight patients had ocular melanoma, and eight patients had an unknown primary. BRAF mutational status was known for 70 tumors, and 16 tumors were BRAF mutated. Three patients had experienced progression after a BRAF -targeted therapy before enrollment, and one of the three patients exhibited a PR on this trial. Ten patients had radiated brain metastases, and five additional patients in cohort 6 had untreated brain metastases. Patient characteristics at trial entry are listed in Table 2 ."
      },
      {
        "id": "CE-3d8eec84671e98906b6a26f1-span-48651a6ff2a4662c633e6f67",
        "source_id": "report-65875e0544371b4e292a70e4:main-html:2b5c951227f1525d",
        "block_id": "b00011",
        "supporting_quote": "<section class=\"tw xbox font-sm\" id=\"T1\"><h4 class=\"obj_head\">Table 1.</h4>\n<div class=\"caption p\"><p>Description of Cohorts</p></div>\n<div class=\"tbl-box p\" tabindex=\"0\"><table class=\"content\" frame=\"box\" rules=\"groups\">\n<thead valign=\"bottom\"><tr>\n<th align=\"center\" rowspan=\"1\" colspan=\"1\">Cohort</th>\n<th align=\"center\" rowspan=\"1\" colspan=\"1\">No. of Patients</th>\n<th align=\"center\" rowspan=\"1\" colspan=\"1\">Dose of Nivolumab (mg/kg)</th>\n<th align=\"center\" rowspan=\"1\" colspan=\"1\">Received Prior Ipilimumab</th>\n<th align=\"center\" rowspan=\"1\" colspan=\"1\">Received Peptide Vaccine</th>\n<th align=\"center\" rowspan=\"1\" colspan=\"1\">HLA-A*0201 Positive</th>\n</tr></thead>\n<tbody valign=\"top\">\n<tr>\n<td align=\"left\" rowspan=\"1\" colspan=\"1\">Cohort 1</td>\n<td align=\"center\" rowspan=\"1\" colspan=\"1\">10</td>\n<td align=\"center\" rowspan=\"1\" colspan=\"1\">1</td>\n<td align=\"left\" rowspan=\"1\" colspan=\"1\">No</td>\n<td align=\"left\" rowspan=\"1\" colspan=\"1\">Yes</td>\n<td align=\"left\" rowspan=\"1\" colspan=\"1\">Yes</td>\n</tr>\n<tr>\n<td align=\"left\" rowspan=\"1\" colspan=\"1\">Cohort 2</td>\n<td align=\"center\" rowspan=\"1\" colspan=\"1\">13</td>\n<td align=\"center\" rowspan=\"1\" colspan=\"1\">3</td>\n<td align=\"left\" rowspan=\"1\" colspan=\"1\">No</td>\n<td align=\"left\" rowspan=\"1\" colspan=\"1\">Yes</td>\n<td align=\"left\" rowspan=\"1\" colspan=\"1\">Yes</td>\n</tr>\n<tr>\n<td align=\"left\" rowspan=\"1\" colspan=\"1\">Cohort 3</td>\n<td align=\"center\" rowspan=\"1\" colspan=\"1\">11</td>\n<td align=\"center\" rowspan=\"1\" colspan=\"1\">10</td>\n<td align=\"left\" rowspan=\"1\" colspan=\"1\">No</td>\n<td align=\"left\" rowspan=\"1\" colspan=\"1\">Yes</td>\n<td align=\"left\" rowspan=\"1\" colspan=\"1\">Yes</td>\n</tr>\n<tr>\n<td align=\"left\" rowspan=\"1\" colspan=\"1\">Cohort 4</td>\n<td align=\"center\" rowspan=\"1\" colspan=\"1\">10</td>\n<td align=\"center\" rowspan=\"1\" colspan=\"1\">3</td>\n<td align=\"left\" rowspan=\"1\" colspan=\"1\">Yes</td>\n<td align=\"left\" rowspan=\"1\" colspan=\"1\">Yes</td>\n<td align=\"left\" rowspan=\"1\" colspan=\"1\">Yes</td>\n</tr>\n<tr>\n<td align=\"left\" rowspan=\"1\" colspan=\"1\">Cohort 5</td>\n<td align=\"center\" rowspan=\"1\" colspan=\"1\">5</td>\n<td align=\"center\" rowspan=\"1\" colspan=\"1\">3</td>\n<td align=\"left\" rowspan=\"1\" colspan=\"1\">Yes</td>\n<td align=\"left\" rowspan=\"1\" colspan=\"1\">Yes</td>\n<td align=\"left\" rowspan=\"1\" colspan=\"1\">Yes</td>\n</tr>\n<tr>\n<td align=\"left\" rowspan=\"1\" colspan=\"1\">Cohort 6</td>\n<td align=\"center\" rowspan=\"1\" colspan=\"1\">41</td>\n<td align=\"center\" rowspan=\"1\" colspan=\"1\">3</td>\n<td align=\"left\" rowspan=\"1\" colspan=\"1\">Yes</td>\n<td align=\"left\" rowspan=\"1\" colspan=\"1\">No</td>\n<td align=\"left\" rowspan=\"1\" colspan=\"1\">Not required</td>\n</tr>\n</tbody>\n</table></div>\n<div class=\"p text-right font-secondary\"><a href=\"table/T1/\" class=\"usa-link\" target=\"_blank\" rel=\"noopener noreferrer\">Open in a new tab</a></div>\n<div class=\"tw-foot p\"><div class=\"fn\" id=\"fn1\"><p>NOTE. For cohorts 4 and 6, only grade 1 and 2 dose-limiting toxicities for ipilimumab were allowed; cohort 5 patients were required to have had grade 3 dose-limiting toxicity for ipilimumab.</p></div></div></section>"
      },
      {
        "id": "CE-3d8eec84671e98906b6a26f1-span-5f3dbc3fb7a29710c0340ae0",
        "source_id": "report-65875e0544371b4e292a70e4:main-html:2b5c951227f1525d",
        "block_id": "b00049",
        "supporting_quote": "Cohort 1 was treated at 1 mg/kg; cohorts 2, 4, 5, and 6 were treated at 3 mg/kg; and cohort 3 was treated at 10 mg/kg of nivolumab. Patients on cohorts 4 and 6 were ipilimumab refractory and could have had grade 1 or 2 toxicity, but patients on cohort 5 could have had grade 3 dose-limiting toxicity (DLT) after ipilimumab without requiring infliximab. Patients on cohorts 4 and 5 were HLA-A*0201 positive and received peptide vaccine; cohort 6 was an extension group totaling 41 patients who were not required to be HLA-A*0201 positive and did not receive peptide vaccine, as shown in Table 1 . Each treatment cycle (12 weeks) comprised six doses of nivolumab and peptide vaccine administered every 2 weeks. Patients received two cycles with response assessments at 12 and 24 weeks. After 24 weeks, nivolumab alone was administered for those with stable or regressing disease every 12 weeks for up to 2 years."
      }
    ],
    "reason": "Both stages describe the same90 enrolled participants. Full text expands dose cohorts and vaccine allocation: cohorts1-5 received nivolumab plus vaccine; cohort6 received nivolumab alone. Same overall OR regimen, with dose and phase detail retained separately.",
    "treatment_preferences": {
      "intervention": {
        "context": 1,
        "reason": "The same 90 enrolled patients comprise cohorts 1–5 receiving nivolumab plus multipeptide vaccine and cohort 6 receiving nivolumab alone. The full-text OR graph retains these alternatives and separate doses; it does not describe a uniform combination arm.",
        "evidence": [
          {
            "id": "CE-3d8eec84671e98906b6a26f1-span-eb0d72ce2adc927ea6fd6282",
            "source_id": "report-65875e0544371b4e292a70e4:main-html:2b5c951227f1525d",
            "block_id": "b00010",
            "supporting_quote": "Ninety patients were enrolled at Moffitt Cancer Center onto this trial approved by the University of South Florida Institutional Review Board (ClinicalTrials.gov identifier: NCT01176461 ). Inclusion criteria included written informed consent; age ≥ 16 years; histologic diagnosis of unresectable stage III or IV melanoma with measurable disease by RECIST 1.1; progressive disease after at least one previous systemic treatment; positive tumor staining in at least 10% of tumor cells for gp100, NY-ESO-1, and/or MART-1; Eastern Cooperative Oncology Group performance status of 0 or 1; and adequate hepatic, renal, and hematologic function. Patients were prescreened for HLA-A*0201 by allele-specific polymerase chain reaction for cohorts 1 to 5. Patients with treated brain metastases were allowed if they were radiologically stable 8 weeks after treatment; patients with untreated brain metastases were allowed in cohort 6. Any number of prior therapies was allowed; treatment with prior anti–PD-1 or anti–PD-L1 was not. The 34 patients in consecutively accrued cohorts 1 to 3 were ipilimumab naive and received nivolumab with peptide vaccine, and the 56 patients in cohorts 4 to 6 (ipilimumab refractory) had progressive disease without responding to prior ipilimumab. Cohorts 4 and 5 were consecutively accrued and received nivolumab with peptide vaccine, and cohort 6 received nivolumab alone and accrued concurrently with cohorts 4 to 5 ( Table 1 ). Before completing one cycle, in cohorts 1 to 3, two patients experienced progression, one withdrew consent, and one developed dose-limiting optic neuritis; in cohorts 4 to 6, one patient withdrew consent. All five patients had progressive disease, were included in the analysis for safety and efficacy, and were replaced per protocol. No patients were ineligible or lost to follow-up."
          },
          {
            "id": "CE-3d8eec84671e98906b6a26f1-span-48651a6ff2a4662c633e6f67",
            "source_id": "report-65875e0544371b4e292a70e4:main-html:2b5c951227f1525d",
            "block_id": "b00011",
            "supporting_quote": "<section class=\"tw xbox font-sm\" id=\"T1\"><h4 class=\"obj_head\">Table 1.</h4>\n<div class=\"caption p\"><p>Description of Cohorts</p></div>\n<div class=\"tbl-box p\" tabindex=\"0\"><table class=\"content\" frame=\"box\" rules=\"groups\">\n<thead valign=\"bottom\"><tr>\n<th align=\"center\" rowspan=\"1\" colspan=\"1\">Cohort</th>\n<th align=\"center\" rowspan=\"1\" colspan=\"1\">No. of Patients</th>\n<th align=\"center\" rowspan=\"1\" colspan=\"1\">Dose of Nivolumab (mg/kg)</th>\n<th align=\"center\" rowspan=\"1\" colspan=\"1\">Received Prior Ipilimumab</th>\n<th align=\"center\" rowspan=\"1\" colspan=\"1\">Received Peptide Vaccine</th>\n<th align=\"center\" rowspan=\"1\" colspan=\"1\">HLA-A*0201 Positive</th>\n</tr></thead>\n<tbody valign=\"top\">\n<tr>\n<td align=\"left\" rowspan=\"1\" colspan=\"1\">Cohort 1</td>\n<td align=\"center\" rowspan=\"1\" colspan=\"1\">10</td>\n<td align=\"center\" rowspan=\"1\" colspan=\"1\">1</td>\n<td align=\"left\" rowspan=\"1\" colspan=\"1\">No</td>\n<td align=\"left\" rowspan=\"1\" colspan=\"1\">Yes</td>\n<td align=\"left\" rowspan=\"1\" colspan=\"1\">Yes</td>\n</tr>\n<tr>\n<td align=\"left\" rowspan=\"1\" colspan=\"1\">Cohort 2</td>\n<td align=\"center\" rowspan=\"1\" colspan=\"1\">13</td>\n<td align=\"center\" rowspan=\"1\" colspan=\"1\">3</td>\n<td align=\"left\" rowspan=\"1\" colspan=\"1\">No</td>\n<td align=\"left\" rowspan=\"1\" colspan=\"1\">Yes</td>\n<td align=\"left\" rowspan=\"1\" colspan=\"1\">Yes</td>\n</tr>\n<tr>\n<td align=\"left\" rowspan=\"1\" colspan=\"1\">Cohort 3</td>\n<td align=\"center\" rowspan=\"1\" colspan=\"1\">11</td>\n<td align=\"center\" rowspan=\"1\" colspan=\"1\">10</td>\n<td align=\"left\" rowspan=\"1\" colspan=\"1\">No</td>\n<td align=\"left\" rowspan=\"1\" colspan=\"1\">Yes</td>\n<td align=\"left\" rowspan=\"1\" colspan=\"1\">Yes</td>\n</tr>\n<tr>\n<td align=\"left\" rowspan=\"1\" colspan=\"1\">Cohort 4</td>\n<td align=\"center\" rowspan=\"1\" colspan=\"1\">10</td>\n<td align=\"center\" rowspan=\"1\" colspan=\"1\">3</td>\n<td align=\"left\" rowspan=\"1\" colspan=\"1\">Yes</td>\n<td align=\"left\" rowspan=\"1\" colspan=\"1\">Yes</td>\n<td align=\"left\" rowspan=\"1\" colspan=\"1\">Yes</td>\n</tr>\n<tr>\n<td align=\"left\" rowspan=\"1\" colspan=\"1\">Cohort 5</td>\n<td align=\"center\" rowspan=\"1\" colspan=\"1\">5</td>\n<td align=\"center\" rowspan=\"1\" colspan=\"1\">3</td>\n<td align=\"left\" rowspan=\"1\" colspan=\"1\">Yes</td>\n<td align=\"left\" rowspan=\"1\" colspan=\"1\">Yes</td>\n<td align=\"left\" rowspan=\"1\" colspan=\"1\">Yes</td>\n</tr>\n<tr>\n<td align=\"left\" rowspan=\"1\" colspan=\"1\">Cohort 6</td>\n<td align=\"center\" rowspan=\"1\" colspan=\"1\">41</td>\n<td align=\"center\" rowspan=\"1\" colspan=\"1\">3</td>\n<td align=\"left\" rowspan=\"1\" colspan=\"1\">Yes</td>\n<td align=\"left\" rowspan=\"1\" colspan=\"1\">No</td>\n<td align=\"left\" rowspan=\"1\" colspan=\"1\">Not required</td>\n</tr>\n</tbody>\n</table></div>\n<div class=\"p text-right font-secondary\"><a href=\"table/T1/\" class=\"usa-link\" target=\"_blank\" rel=\"noopener noreferrer\">Open in a new tab</a></div>\n<div class=\"tw-foot p\"><div class=\"fn\" id=\"fn1\"><p>NOTE. For cohorts 4 and 6, only grade 1 and 2 dose-limiting toxicities for ipilimumab were allowed; cohort 5 patients were required to have had grade 3 dose-limiting toxicity for ipilimumab.</p></div></div></section>"
          },
          {
            "id": "CE-3d8eec84671e98906b6a26f1-span-5f3dbc3fb7a29710c0340ae0",
            "source_id": "report-65875e0544371b4e292a70e4:main-html:2b5c951227f1525d",
            "block_id": "b00049",
            "supporting_quote": "Cohort 1 was treated at 1 mg/kg; cohorts 2, 4, 5, and 6 were treated at 3 mg/kg; and cohort 3 was treated at 10 mg/kg of nivolumab. Patients on cohorts 4 and 6 were ipilimumab refractory and could have had grade 1 or 2 toxicity, but patients on cohort 5 could have had grade 3 dose-limiting toxicity (DLT) after ipilimumab without requiring infliximab. Patients on cohorts 4 and 5 were HLA-A*0201 positive and received peptide vaccine; cohort 6 was an extension group totaling 41 patients who were not required to be HLA-A*0201 positive and did not receive peptide vaccine, as shown in Table 1 . Each treatment cycle (12 weeks) comprised six doses of nivolumab and peptide vaccine administered every 2 weeks. Patients received two cycles with response assessments at 12 and 24 weeks. After 24 weeks, nivolumab alone was administered for those with stable or regressing disease every 12 weeks for up to 2 years."
          }
        ]
      }
    }
  }
];
});
